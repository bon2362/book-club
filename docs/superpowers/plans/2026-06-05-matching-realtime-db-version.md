# Matching realtime: DB-backed сигнал обновления — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить in-memory SSE-broadcast на монотонный счётчик версии сессии в Postgres, чтобы изменения на `/matching` доходили до всех пользователей на любом числе serverless-инстансов.

**Architecture:** Каждая мутация сессии инкрементит `matching_sessions.state_version`. Клиент раз в 3с поллит лёгкий endpoint `/api/matching/version`; при росте версии зовёт `router.refresh()`. Вся in-memory realtime-инфра (hub, SSE-stream, presence, heartbeat) удаляется.

**Tech Stack:** Next.js 14 (App Router), Drizzle ORM, Neon Postgres, Jest (node env), Playwright.

---

## Спека
`docs/superpowers/specs/2026-06-05-matching-realtime-db-version-design.md`

## ВАЖНО про запуск тестов из worktree
`npm test` из каталога `.claude/worktrees/…` может найти **0 тестов и молча пройти** (Jest исключает worktree-пути). Запускай unit-тесты из основного checkout репозитория, либо полагайся на CI. Это не повод считать задачу выполненной — нужен зелёный прогон.

## Карта файлов

**Создаём:**
- `drizzle/0037_matching_session_state_version.sql` — миграция (генерируется drizzle-kit)
- `drizzle/matching-session-state-version-migration.test.ts` — тест миграции
- `lib/matching/realtime/version.ts` — хелпер bump/read версии
- `lib/matching/realtime/__tests__/version.test.ts` — unit-тест хелпера
- `app/api/matching/version/route.ts` — endpoint опроса версии
- `app/api/matching/version/route.test.ts` — тест endpoint
- `e2e/matching-realtime.spec.ts` — e2e кросс-пользовательского распространения

**Меняем:**
- `lib/db/schema.ts` — колонка `state_version`
- `lib/matching/realtime/state-change.ts` — broadcast → bumpSessionState
- `lib/matching/realtime/__tests__/state-change.test.ts` — обновить мок
- `app/api/matching/priorities/route.ts`
- `app/api/matching/books/route.ts`
- `app/api/matching/books/[bookId]/route.ts`
- `app/api/matching/sessions/[id]/route.ts` (+ `route.test.ts`)
- `app/api/matching/sessions/[id]/join/route.ts`
- `app/api/matching/sessions/[id]/leave/route.ts`
- `app/api/matching/sessions/[id]/freeze/route.ts`
- `components/nd/MatchingRealtimeClient.tsx`
- `components/nd/MatchingRealtimeWrapper.tsx`

**Удаляем:**
- `lib/matching/realtime/hub.ts` + `lib/matching/realtime/__tests__/hub.test.ts`
- `app/api/matching/stream/route.ts`
- `lib/matching/realtime/presence.ts` + `lib/matching/realtime/__tests__/presence.test.ts`
- `app/api/matching/sessions/[id]/heartbeat/route.ts`

---

## Task 1: Колонка state_version + миграция

**Files:**
- Modify: `lib/db/schema.ts` (блок `matchingSessions`, начинается со строки 187)
- Create: `drizzle/0037_matching_session_state_version.sql` (генерируется)
- Test: `drizzle/matching-session-state-version-migration.test.ts`

- [ ] **Step 1: Добавить колонку в схему**

В `lib/db/schema.ts`, внутри `matchingSessions = pgTable('matching_sessions', { … })`, добавить поле сразу после `maxGroupSize`:

```ts
  minGroupSize:       integer('min_group_size').notNull().default(3),
  maxGroupSize:       integer('max_group_size').notNull().default(3),
  stateVersion:       integer('state_version').notNull().default(0),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npx drizzle-kit generate --name matching_session_state_version`
Expected: создан `drizzle/0037_matching_session_state_version.sql` со строкой `ADD COLUMN "state_version"`, обновлены `drizzle/meta/_journal.json` и snapshot.

Проверить содержимое: `cat drizzle/0037_matching_session_state_version.sql`
Ожидаемо примерно: `ALTER TABLE "matching_sessions" ADD COLUMN "state_version" integer DEFAULT 0 NOT NULL;`

- [ ] **Step 3: Написать тест миграции**

```ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0037 matching session state_version migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0037_matching_session_state_version.sql'),
    'utf8',
  )

  it('adds a non-null state_version counter defaulting to 0', () => {
    expect(sql).toContain('ALTER TABLE "matching_sessions"')
    expect(sql).toContain('"state_version" integer')
    expect(sql).toContain('DEFAULT 0')
    expect(sql).toContain('NOT NULL')
  })
})
```

- [ ] **Step 4: Прогнать тест**

Run (из основного checkout): `npx jest drizzle/matching-session-state-version-migration.test.ts`
Expected: PASS

- [ ] **Step 5: Применить миграцию на dev/e2e БД**

Run: `npx drizzle-kit migrate` (применит к БД из `DATABASE_URL`). Для e2e-ветки — с `.env.test.local`.
Expected: миграция применена без ошибок.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/0037_matching_session_state_version.sql drizzle/meta drizzle/matching-session-state-version-migration.test.ts
git commit -m "feat(matching): add state_version counter column"
```

---

## Task 2: Хелпер version.ts

**Files:**
- Create: `lib/matching/realtime/version.ts`
- Test: `lib/matching/realtime/__tests__/version.test.ts`

- [ ] **Step 1: Написать failing-тест**

```ts
import { bumpSessionState, getSessionState } from '../version'

const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) }
const selectChain = {
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([{ version: 5, status: 'active' }]),
}
const mockDb = {
  update: jest.fn(() => updateChain),
  select: jest.fn(() => selectChain),
} as unknown as typeof import('@/lib/db').db

jest.mock('@/lib/db/schema', () => ({ matchingSessions: { id: 'id', stateVersion: 'state_version', status: 'status' } }))

describe('matching realtime version helper', () => {
  beforeEach(() => jest.clearAllMocks())

  it('bumpSessionState issues a single update on the session row', async () => {
    await bumpSessionState('session-1', mockDb)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updateChain.set).toHaveBeenCalledTimes(1)
    expect(updateChain.where).toHaveBeenCalledTimes(1)
  })

  it('getSessionState returns version and status', async () => {
    const state = await getSessionState('session-1', mockDb)
    expect(state).toEqual({ version: 5, status: 'active' })
  })

  it('getSessionState returns null for missing session', async () => {
    selectChain.limit.mockResolvedValueOnce([])
    const state = await getSessionState('nope', mockDb)
    expect(state).toBeNull()
  })
})
```

- [ ] **Step 2: Прогнать — убедиться что падает**

Run: `npx jest lib/matching/realtime/__tests__/version.test.ts`
Expected: FAIL — `Cannot find module '../version'`

- [ ] **Step 3: Реализовать хелпер**

```ts
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'

/**
 * Инкрементит счётчик версии сессии — единственный сигнал «состояние изменилось»,
 * который видят все serverless-инстансы. Заменяет in-memory broadcast.
 */
export async function bumpSessionState(
  sessionId: string,
  dbClient: typeof db = db,
): Promise<void> {
  await dbClient
    .update(matchingSessions)
    .set({ stateVersion: sql`${matchingSessions.stateVersion} + 1` })
    .where(eq(matchingSessions.id, sessionId))
}

export interface SessionState {
  version: number
  status: string
}

export async function getSessionState(
  sessionId: string,
  dbClient: typeof db = db,
): Promise<SessionState | null> {
  const [row] = await dbClient
    .select({ version: matchingSessions.stateVersion, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)
  return row ?? null
}
```

- [ ] **Step 4: Прогнать — PASS**

Run: `npx jest lib/matching/realtime/__tests__/version.test.ts`
Expected: PASS (3 теста)

- [ ] **Step 5: Commit**

```bash
git add lib/matching/realtime/version.ts lib/matching/realtime/__tests__/version.test.ts
git commit -m "feat(matching): add session state_version bump/read helper"
```

---

## Task 3: Endpoint /api/matching/version

**Files:**
- Create: `app/api/matching/version/route.ts`
- Test: `app/api/matching/version/route.test.ts`

- [ ] **Step 1: Написать failing-тест**

```ts
/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(session?: string) {
  const url = session
    ? `http://localhost/api/matching/version?session=${session}`
    : 'http://localhost/api/matching/version'
  return new Request(url) as unknown as import('next/server').NextRequest
}

describe('GET /api/matching/version', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 without session param', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const res = await GET(makeReq())
    expect(res.status).toBe(400)
  })

  it('returns version and status for an admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 7, status: 'active' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(sessionSelect)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 7, status: 'active' })
  })

  it('returns 403 for a non-participant non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 1, status: 'active' }]),
    }
    const participantSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(participantSelect)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Прогнать — FAIL**

Run: `npx jest app/api/matching/version/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Реализовать endpoint** (паттерн из `app/api/matching/feed/route.ts`)

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessionParticipants, matchingSessions } from '@/lib/db/schema'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = req.nextUrl.searchParams.get('session')
  if (!sessionId) return NextResponse.json({ error: 'session param required' }, { status: 400 })

  const [matchingSession] = await db
    .select({
      id: matchingSessions.id,
      version: matchingSessions.stateVersion,
      status: matchingSessions.status,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (!session.user.isAdmin) {
    const [participant] = await db
      .select({ userId: matchingSessionParticipants.userId })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, sessionId),
          eq(matchingSessionParticipants.userId, session.user.id),
        ),
      )
      .limit(1)

    if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  return NextResponse.json({ version: matchingSession.version, status: matchingSession.status })
}
```

- [ ] **Step 4: Прогнать — PASS**

Run: `npx jest app/api/matching/version/route.test.ts`
Expected: PASS (4 теста)

- [ ] **Step 5: Commit**

```bash
git add app/api/matching/version/route.ts app/api/matching/version/route.test.ts
git commit -m "feat(matching): add /api/matching/version polling endpoint"
```

---

## Task 4: Перевести 7 matching-роутов на bumpSessionState

Во всех семи файлах: заменить импорт `broadcast` на `bumpSessionState` и строку вызова. Все хэндлеры `async`, поэтому `await` корректен.

**Files:**
- Modify: `app/api/matching/priorities/route.ts`
- Modify: `app/api/matching/books/route.ts`
- Modify: `app/api/matching/books/[bookId]/route.ts`
- Modify: `app/api/matching/sessions/[id]/route.ts`
- Modify: `app/api/matching/sessions/[id]/join/route.ts`
- Modify: `app/api/matching/sessions/[id]/leave/route.ts`
- Modify: `app/api/matching/sessions/[id]/freeze/route.ts`
- Modify: `app/api/matching/sessions/[id]/route.test.ts`

- [ ] **Step 1: priorities/route.ts**

Заменить импорт:
```ts
import { broadcast } from '@/lib/matching/realtime/hub'
```
на
```ts
import { bumpSessionState } from '@/lib/matching/realtime/version'
```
Заменить строку:
```ts
  broadcast(activeSession.id, 'state_changed', { kind: 'ranks_updated' })
```
на
```ts
  await bumpSessionState(activeSession.id)
```

- [ ] **Step 2: books/route.ts**

Импорт `broadcast` → `bumpSessionState` (как выше). Заменить:
```ts
  broadcast(activeSession.id, 'state_changed', { kind: 'book_added', bookId })
```
на
```ts
  await bumpSessionState(activeSession.id)
```

- [ ] **Step 3: books/[bookId]/route.ts**

Импорт → `bumpSessionState`. Заменить:
```ts
  broadcast(activeSession.id, 'state_changed', { kind: 'book_removed', bookId })
```
на
```ts
  await bumpSessionState(activeSession.id)
```

- [ ] **Step 4: sessions/[id]/route.ts**

Импорт → `bumpSessionState`. Заменить блок:
```ts
  broadcast(params.id, 'state_changed', {
    kind: 'group_size_range_updated',
    minGroupSize,
    maxGroupSize,
  })
```
на
```ts
  await bumpSessionState(params.id)
```
(Имена `minGroupSize`/`maxGroupSize` больше не нужны для сигнала, но остаются в `set(...)` выше — не трогать.)

- [ ] **Step 5: sessions/[id]/join/route.ts**

Импорт → `bumpSessionState`. Заменить:
```ts
  broadcast(sessionId, 'state_changed', { kind: 'participant_joined' })
```
на
```ts
  await bumpSessionState(sessionId)
```

- [ ] **Step 6: sessions/[id]/leave/route.ts**

Импорт → `bumpSessionState`. Заменить:
```ts
  broadcast(sessionId, 'state_changed', { kind: 'participant_left' })
```
на
```ts
  await bumpSessionState(sessionId)
```

- [ ] **Step 7: sessions/[id]/freeze/route.ts**

Импорт → `bumpSessionState`. Заменить:
```ts
  broadcast(params.id, 'session_frozen', { frozen_at: frozenAt.toISOString() })
```
на
```ts
  await bumpSessionState(params.id)
```

- [ ] **Step 8: Обновить sessions/[id]/route.test.ts**

Заменить мок и ассерт. Импорт/мок:
```ts
import { broadcast } from '@/lib/matching/realtime/hub'
...
jest.mock('@/lib/matching/realtime/hub', () => ({ broadcast: jest.fn() }))
const mockBroadcast = broadcast as jest.Mock
```
заменить на:
```ts
import { bumpSessionState } from '@/lib/matching/realtime/version'
...
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))
const mockBump = bumpSessionState as jest.Mock
```
В тесте `updates active session group size and broadcasts state change` заменить:
```ts
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
      kind: 'group_size_range_updated',
      minGroupSize: 3,
      maxGroupSize: 4,
    })
```
на:
```ts
    expect(mockBump).toHaveBeenCalledWith('session-1')
```

- [ ] **Step 9: Прогнать тесты затронутых роутов**

Run: `npx jest app/api/matching/sessions`
Expected: PASS (мок bumpSessionState вызывается с id).

- [ ] **Step 10: typecheck**

Run: `npm run typecheck`
Expected: без ошибок (ни один из 7 файлов больше не ссылается на `broadcast`).

- [ ] **Step 11: Commit**

```bash
git add app/api/matching/priorities/route.ts app/api/matching/books app/api/matching/sessions
git commit -m "refactor(matching): bump session state_version instead of in-memory broadcast"
```

---

## Task 5: Перевести state-change.ts (покрывает 5 signup/admin-роутов)

`broadcastActiveMatchingStateChangeForParticipant` используется в `signup`, `admin/signup-books`, `admin/remove-book`, `signup-books/[bookId]/status`, `priorities` (legacy). Меняем тело хелпера — все консьюмеры покрываются автоматически, их сигнатуры не меняются.

**Files:**
- Modify: `lib/matching/realtime/state-change.ts`
- Modify: `lib/matching/realtime/__tests__/state-change.test.ts`

- [ ] **Step 1: Обновить тест хелпера**

В `lib/matching/realtime/__tests__/state-change.test.ts` заменить мок hub на мок version:
```ts
jest.mock('../hub', () => ({ broadcast: jest.fn() }))
```
на
```ts
jest.mock('../version', () => ({ bumpSessionState: jest.fn() }))
```
и импорт/алиас:
```ts
import { broadcast } from '../hub'
const mockBroadcast = broadcast as jest.Mock
```
на
```ts
import { bumpSessionState } from '../version'
const mockBump = bumpSessionState as jest.Mock
```
В тесте `broadcasts state_changed for active session participants` заменить ассерт:
```ts
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
```
на проверку, что bump вызван с id активной сессии:
```ts
    expect(mockBump).toHaveBeenCalledWith('session-1')
```
(Остальные строки объекта payload в этом ассерте удалить.)

- [ ] **Step 2: Прогнать — FAIL**

Run: `npx jest lib/matching/realtime/__tests__/state-change.test.ts`
Expected: FAIL (хелпер ещё зовёт broadcast).

- [ ] **Step 3: Переписать тело хелпера**

В `lib/matching/realtime/state-change.ts` заменить импорт:
```ts
import { broadcast } from './hub'
```
на
```ts
import { bumpSessionState } from './version'
```
и тело `broadcastActiveMatchingStateChangeForParticipant`:
```ts
  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  if (!activeSessionId) return null

  broadcast(activeSessionId, 'state_changed', payload)
  return activeSessionId
```
на:
```ts
  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  if (!activeSessionId) return null

  await bumpSessionState(activeSessionId)
  return activeSessionId
```
Параметр `payload: MatchingStateChangePayload` оставить в сигнатуре (консьюмеры его передают), но он больше не используется внутри. Чтобы не словить `no-unused-vars`, переименовать в `_payload`:
```ts
export async function broadcastActiveMatchingStateChangeForParticipant(
  userId: string,
  _payload: MatchingStateChangePayload,
): Promise<string | null> {
```

- [ ] **Step 4: Прогнать — PASS**

Run: `npx jest lib/matching/realtime/__tests__/state-change.test.ts`
Expected: PASS

- [ ] **Step 5: lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: без ошибок (проверяет, что `_payload` не ломает no-unused-vars и консьюмеры компилируются).

- [ ] **Step 6: Commit**

```bash
git add lib/matching/realtime/state-change.ts lib/matching/realtime/__tests__/state-change.test.ts
git commit -m "refactor(matching): state-change helper bumps state_version"
```

---

## Task 6: Polling-клиент вместо SSE

**Files:**
- Modify: `components/nd/MatchingRealtimeClient.tsx` (полная замена)
- Modify: `components/nd/MatchingRealtimeWrapper.tsx`
- Test: `components/nd/MatchingRealtimeClient.test.tsx`

- [ ] **Step 1: Написать тест клиента (failing)**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import MatchingRealtimeClient from './MatchingRealtimeClient'

describe('MatchingRealtimeClient (polling)', () => {
  let fetchMock: jest.Mock
  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  function respondVersion(version: number) {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version, status: 'active' }) })
  }

  it('does not fire onStateChange on the first poll (baseline)', async () => {
    respondVersion(1)
    const onChange = jest.fn()
    render(<MatchingRealtimeClient sessionId="s1" onStateChange={onChange} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires onStateChange when the version increases', async () => {
    respondVersion(1)
    respondVersion(2)
    const onChange = jest.fn()
    render(<MatchingRealtimeClient sessionId="s1" onStateChange={onChange} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    jest.advanceTimersByTime(3_000)
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })
})
```

- [ ] **Step 2: Прогнать — FAIL**

Run: `npx jest components/nd/MatchingRealtimeClient.test.tsx`
Expected: FAIL (старый клиент использует EventSource, нет такого поведения / падает на отсутствии onStateChange-по-версии).

- [ ] **Step 3: Полностью заменить MatchingRealtimeClient.tsx**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Props {
  sessionId: string
  onStateChange: () => void
}

const POLL_INTERVAL_MS = 3_000

export default function MatchingRealtimeClient({ sessionId, onStateChange }: Props) {
  const [healthy, setHealthy] = useState(true)
  const lastVersionRef = useRef<number | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) {
        setHealthy(false)
        return
      }
      const data = (await res.json()) as { version: number }
      setHealthy(true)
      if (lastVersionRef.current === null) {
        lastVersionRef.current = data.version
        return
      }
      if (data.version !== lastVersionRef.current) {
        lastVersionRef.current = data.version
        onStateChange()
      }
    } catch {
      setHealthy(false)
    }
  }, [sessionId, onStateChange])

  useEffect(() => {
    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [poll])

  return (
    <div
      data-testid="matching-realtime-indicator"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        fontSize: '0.6rem',
        color: healthy ? '#4a7' : 'var(--text-muted)',
        fontFamily: 'var(--nd-mono), monospace',
        opacity: 0.6,
        userSelect: 'none',
      }}
    >
      {healthy ? '●' : '⟳ синхр.'}
    </div>
  )
}
```

- [ ] **Step 4: Упростить MatchingRealtimeWrapper.tsx**

Полная замена файла (убрать `onFrozen`/`handleFrozen`):
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import MatchingRealtimeClient from './MatchingRealtimeClient'

interface Props {
  sessionId: string
}

export default function MatchingRealtimeWrapper({ sessionId }: Props) {
  const router = useRouter()

  const handleStateChange = useCallback(() => {
    router.refresh()
  }, [router])

  return <MatchingRealtimeClient sessionId={sessionId} onStateChange={handleStateChange} />
}
```

- [ ] **Step 5: Прогнать — PASS**

Run: `npx jest components/nd/MatchingRealtimeClient.test.tsx`
Expected: PASS (2 теста)

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: без ошибок (wrapper больше не передаёт onFrozen/onPresence; новый Props их не имеет).

- [ ] **Step 7: Commit**

```bash
git add components/nd/MatchingRealtimeClient.tsx components/nd/MatchingRealtimeWrapper.tsx components/nd/MatchingRealtimeClient.test.tsx
git commit -m "refactor(matching): poll state_version instead of SSE on the client"
```

---

## Task 7: Удалить мёртвую in-memory инфру

После Task 4 и 5 у hub не осталось продакшен-консьюмеров, кроме `stream/route.ts` и `presence.ts`. Удаляем их вместе.

**Files (delete):**
- `lib/matching/realtime/hub.ts`
- `lib/matching/realtime/__tests__/hub.test.ts`
- `app/api/matching/stream/route.ts`
- `lib/matching/realtime/presence.ts`
- `lib/matching/realtime/__tests__/presence.test.ts`
- `app/api/matching/sessions/[id]/heartbeat/route.ts`

- [ ] **Step 1: Проверить, что других импортов hub/presence не осталось**

Run:
```bash
grep -rn "realtime/hub\|realtime/presence\|matching/stream\|/heartbeat" app lib components --include=*.ts --include=*.tsx | grep -v "version.ts\|__tests__/version"
```
Expected: пусто (кроме, возможно, e2e-спеки старого heartbeat — если найдётся, поправить в Task 8). Если что-то ссылается — устранить перед удалением.

- [ ] **Step 2: Удалить файлы**

```bash
git rm lib/matching/realtime/hub.ts \
       lib/matching/realtime/__tests__/hub.test.ts \
       app/api/matching/stream/route.ts \
       lib/matching/realtime/presence.ts \
       lib/matching/realtime/__tests__/presence.test.ts \
       "app/api/matching/sessions/[id]/heartbeat/route.ts"
```

- [ ] **Step 3: Убрать heartbeat-вызов из клиента, если остался**

Проверить, что в `MatchingRealtimeClient.tsx` (после Task 6) нет обращений к `/heartbeat` — в новой версии их нет. Run:
```bash
grep -rn "heartbeat" components/nd
```
Expected: пусто.

- [ ] **Step 4: lint + typecheck + полный прогон unit**

Run: `npm run lint && npm run typecheck && npx jest`
Expected: всё зелёное, удалённые модули нигде не импортируются.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(matching): remove in-memory SSE hub, presence and heartbeat"
```

---

## Task 8: E2E кросс-пользовательского распространения

Проверяем реальный баг со скринов: мутация одного пользователя доходит до страницы другого без ручной перезагрузки. Используем три пользователя и одну общую книгу, чтобы переход «нет кругов → есть круги» был детерминированно виден на странице наблюдателя.

**Files:**
- Create: `e2e/matching-realtime.spec.ts`

- [ ] **Step 1: Написать e2e-тест**

```ts
import { test, expect, type BrowserContext } from './fixtures'

// Логинит изолированного пользователя в отдельном контексте и заводит его в сессию
// с одной и той же книгой. Возвращает cleanup (удаление test-session).
async function joinAsExtraUser(
  context: BrowserContext,
  email: string,
  name: string,
  sessionId: string,
  bookId: string,
) {
  const sessionRes = await context.request.post('/api/test/session', {
    data: { email, name, isAdmin: false },
  })
  if (!sessionRes.ok()) {
    throw new Error(`/api/test/session failed: ${sessionRes.status()} ${await sessionRes.text()}`)
  }
  const joinRes = await context.request.post(`/api/matching/sessions/${sessionId}/join`)
  if (!joinRes.ok()) throw new Error(`join failed: ${joinRes.status()} ${await joinRes.text()}`)
  const addRes = await context.request.post('/api/matching/books', { data: { bookId } })
  if (!addRes.ok()) throw new Error(`add book failed: ${addRes.status()} ${await addRes.text()}`)
  const rankRes = await context.request.patch('/api/matching/priorities', { data: { bookIds: [bookId] } })
  if (!rankRes.ok()) throw new Error(`rank failed: ${rankRes.status()} ${await rankRes.text()}`)

  return async () => {
    await context.request.delete('/api/test/session', { data: { email } })
  }
}

test('изменение другого участника прилетает на страницу наблюдателя без перезагрузки', async ({
  page,
  browser,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
  const book = await createTestBook({
    title: `E2E Realtime Book ${test.info().testId}`,
    author: 'Realtime Author',
  })

  // Наблюдатель (User B): входит, добавляет книгу, открывает /matching.
  await loginAsUser({ name: 'E2E Realtime Observer' })
  await page.request.post(`/api/matching/sessions/${session.id}/join`)
  await page.request.post('/api/matching/books', { data: { bookId: book.id } })
  await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Войти' }).click().catch(() => {})

  // Пока участников < 3 — кругов нет.
  await expect(page.getByText(/Нужно минимум 3/)).toBeVisible({ timeout: 15_000 })

  // Ещё два пользователя присоединяются в отдельных контекстах с той же книгой.
  const ctxA = await browser.newContext()
  const ctxC = await browser.newContext()
  const cleanups: Array<() => Promise<void>> = []
  try {
    cleanups.push(await joinAsExtraUser(ctxA, `e2e-${test.info().testId}-a@test.invalid`, 'E2E RT A', session.id, book.id))
    cleanups.push(await joinAsExtraUser(ctxC, `e2e-${test.info().testId}-c@test.invalid`, 'E2E RT C', session.id, book.id))

    // Наблюдатель НЕ перезагружает страницу: polling версии (3с) должен сам вызвать
    // router.refresh(), и сообщение об отсутствии кругов должно исчезнуть.
    await expect(page.getByText(/Нужно минимум 3/)).toBeHidden({ timeout: 12_000 })
  } finally {
    for (const fn of cleanups.reverse()) {
      try { await fn() } catch { /* best-effort */ }
    }
    await ctxA.close()
    await ctxC.close()
  }
})
```

- [ ] **Step 2: Прогнать e2e**

Run: `npm run test:e2e -- e2e/matching-realtime.spec.ts`
Expected: PASS. Если упало по таймауту скрытия — увеличить до 15_000 (poll 3с + рендер).

Примечание: точный текст пустого состояния — `Пока недостаточно участников или записей для формирования кругов. Нужно минимум 3` (видно на скриншоте бага). Регэксп `/Нужно минимум 3/` устойчив к остальной части.

- [ ] **Step 3: Commit**

```bash
git add e2e/matching-realtime.spec.ts
git commit -m "test(e2e): другой участник прилетает на /matching без перезагрузки"
```

---

## Task 9: Финальная верификация и PR

- [ ] **Step 1: Полный прогон (из ОСНОВНОГО checkout, не из worktree)**

Run: `npm run lint && npm run typecheck && npm test`
Expected: всё зелёное. Если из worktree Jest нашёл 0 тестов — перезапустить из основного checkout или довериться CI.

- [ ] **Step 2: Wiki**

Оценить `docs/wiki/`: realtime-механика matching меняется (SSE → polling версии, новый endpoint, удалён heartbeat). Если в wiki описан realtime/SSE matching — обновить соответствующую страницу (заменить описание SSE-hub на «polling `/api/matching/version` + счётчик `state_version`»). В финальном ответе явно указать «Wiki: нужна/не нужна — причина».

- [ ] **Step 3: E2E-чеклист**

В сообщении перед PR явно написать: _«E2E: нужен — изменение realtime-флоу /matching, добавлен `e2e/matching-realtime.spec.ts`»_.

- [ ] **Step 4: Создать PR по PR-flow**

```bash
git push -u origin <branch>
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view <num> --json mergeStateStatus,mergeable
```
Поставить background-watch на CI (правило 2 из CLAUDE.md). Задача завершена только после merge в main.

---

## Self-review

- **Покрытие спеки:** схема (T1), хелпер (T2), endpoint (T3), 7 broadcast-сайтов (T4) + state-change/5 консьюмеров (T5 — уточнение к «аудиту» из спеки), клиент-polling (T6), удаление hub/stream/presence/heartbeat (T7), unit+e2e тесты (T1–T8). Все разделы спеки имеют задачу.
- **Плейсхолдеры:** нет — весь код приведён.
- **Согласованность типов:** `bumpSessionState(sessionId, dbClient?)` и `getSessionState(...)` используются единообразно во всех задачах; `MatchingRealtimeClient` Props `{ sessionId, onStateChange }` совпадает с использованием во wrapper и тестах; endpoint возвращает `{ version, status }`, клиент читает `data.version` — согласовано.
- **Уточнение vs спека:** спека говорила «7 мест broadcast + аудит state-change»; план показал, что state-change покрывает ещё 5 роутов через один хелпер — это конкретизация, не противоречие.

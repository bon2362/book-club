# Adrift Persistent Cause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить in-memory `Map` для хранения adrift-причины на чтение из `matching_preference_events` (Postgres), чтобы атрибуция «за бортом» работала в проде на Vercel, где API-роут и рендер страницы — разные serverless-инстансы.

**Architecture:** `finalizeMatchingMutationEffects` уже пишет `before`/`after` лидера в `matching_preference_events`. Новая функция `fetchAdriftCauseForUser` читает эти строки (новейшие первыми) и находит событие, где userId впервые появился в `after.leftOut` — это и есть причина. In-memory `Map` в `adrift.ts` и все его write-вызовы из `mutation-effects.ts` удаляются. Попутно `mutation-effects.ts` радикально упрощается: без in-memory больше не нужен `buildFeedEventsForMutation` и вся связанная логика actor/feedEvents.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Neon Postgres, Jest

---

## Файлы изменений

| Файл | Что делаем |
|---|---|
| `lib/matching/feed-events.ts` | Экспортируем `isMatchingMutationKind` и `asMatchingScenario` |
| `lib/matching/realtime/feed.ts` | Импортируем хелперы из `feed-events`, удаляем локальные определения |
| `lib/matching/adrift.ts` | Полная замена: убираем in-memory Map, добавляем `fetchAdriftCauseForUser` |
| `lib/matching/mutation-effects.ts` | Удаляем всё связанное с adrift + feedEvents; остаётся только запись аналитики |
| `lib/matching/__tests__/adrift.test.ts` | Переписываем под `fetchAdriftCauseForUser` |
| `lib/matching/__tests__/mutation-effects.test.ts` | Убираем adrift-моки и их ассерты |
| `app/matching/page.tsx` | Заменяем синхронный `getAdriftCause` на `await fetchAdriftCauseForUser` |

---

## Task 1: Экспортируем хелперы из feed-events.ts и обновляем feed.ts

**Цель:** `isMatchingMutationKind` и `asMatchingScenario` нужны и `adrift.ts`, и `realtime/feed.ts`. Сейчас они приватны в `feed.ts` — выносим в `feed-events.ts` (там живёт `MatchingMutationKind`), обновляем импорты.

**Files:**
- Modify: `lib/matching/feed-events.ts`
- Modify: `lib/matching/realtime/feed.ts`

- [ ] **Step 1: Добавить экспорты в feed-events.ts**

В конец файла `lib/matching/feed-events.ts` добавить:

```typescript
export function isMatchingMutationKind(value: string): value is MatchingMutationKind {
  return [
    'book_added',
    'book_removed',
    'rank_changed',
    'status_changed',
    'catalog_signup_updated',
    'priorities_updated',
  ].includes(value)
}

export function asMatchingScenario(value: unknown): MatchingScenario | null {
  if (!value || typeof value !== 'object') return null
  return value as MatchingScenario
}
```

- [ ] **Step 2: Обновить импорты в realtime/feed.ts**

Изменить начало файла `lib/matching/realtime/feed.ts`:

```typescript
// Было:
import {
  buildFeedEventsForMutation,
  type FeedEventDraft,
  type MatchingMutationKind,
} from '../feed-events'
import type { MatchingScenario } from '../scenarios'

// Стало:
import {
  asMatchingScenario,
  buildFeedEventsForMutation,
  isMatchingMutationKind,
  type FeedEventDraft,
  type MatchingMutationKind,
} from '../feed-events'
```

Удалить из конца `lib/matching/realtime/feed.ts` локальные определения функций `isMatchingMutationKind` и `asMatchingScenario` (строки 129–143 текущего файла):

```typescript
// Удалить целиком:
function isMatchingMutationKind(value: string): value is MatchingMutationKind {
  return [
    'book_added',
    'book_removed',
    'rank_changed',
    'status_changed',
    'catalog_signup_updated',
    'priorities_updated',
  ].includes(value)
}

function asMatchingScenario(value: unknown): MatchingScenario | null {
  if (!value || typeof value !== 'object') return null
  return value as MatchingScenario
}
```

- [ ] **Step 3: Убедиться что тесты ленты проходят**

```bash
cd /Users/ekoshkin/book-club
npm test -- lib/matching/realtime/__tests__/feed.test.ts --no-coverage
```

Ожидаем: все тесты GREEN.

- [ ] **Step 4: Commit**

```bash
git checkout -b fix/adrift-persistent-cause
git add lib/matching/feed-events.ts lib/matching/realtime/feed.ts
git commit -m "refactor: export isMatchingMutationKind and asMatchingScenario from feed-events"
```

---

## Task 2: Переписываем adrift.ts — убираем Map, добавляем fetchAdriftCauseForUser

**Цель:** Единственная публичная функция для получения adrift-причины теперь читает из БД. `isViewerAdrift` остаётся без изменений (работает с in-memory сценарием, вычисленным на странице).

**Files:**
- Modify: `lib/matching/adrift.ts`
- Modify: `lib/matching/__tests__/adrift.test.ts`

- [ ] **Step 1: Написать новый тест (сначала — красный)**

Полностью заменить содержимое `lib/matching/__tests__/adrift.test.ts`:

```typescript
import { fetchAdriftCauseForUser, isViewerAdrift } from '../adrift'
import type { ScenarioSetOverview } from '../scenarios'

// Минималистичный mock Drizzle: возвращает заданные массивы последовательно
// при каждом вызове .limit()
function makeDb(...results: unknown[][]): Parameters<typeof fetchAdriftCauseForUser>[2] {
  let call = 0
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve(results[call++] ?? [])),
  }
  return chain as never
}

function makeScenario(leftOutIds: string[]): object {
  return {
    id: 'scenario-' + leftOutIds.join('-'),
    leftOut: leftOutIds.map((id) => ({ userId: id, pseudonym: id.toUpperCase() })),
  }
}

const CAUSE_EVENT = {
  actorUserId: 'actor-1',
  eventType: 'book_removed',
  bookId: 'book-a',
  before: makeScenario([]),        // user-a NOT in leftOut before
  after:  makeScenario(['user-a']), // user-a IN leftOut after → this is the cause
  occurredAt: new Date('2026-01-02T10:00:00Z'),
}

const PARTICIPANT_ROW = [{ pseudonym: 'Лиса' }]

describe('fetchAdriftCauseForUser', () => {
  it('returns null when there are no events', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb([]))
    expect(result).toBeNull()
  })

  it('returns the cause event where user first appeared in leftOut', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT],       // 1st query: events
      PARTICIPANT_ROW,     // 2nd query: participant lookup
    ))

    expect(result).toMatchObject({
      actor: { userId: 'actor-1', pseudonym: 'Лиса' },
      bookId: 'book-a',
      mutationKind: 'book_removed',
      at: new Date('2026-01-02T10:00:00Z').getTime(),
    })
  })

  it('picks the most recent cause when user went adrift more than once', async () => {
    const olderCause = {
      ...CAUSE_EVENT,
      bookId: 'book-old',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
    }
    // Rows come newest-first; first is the most recent transition into leftOut
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT, olderCause], // most recent first
      PARTICIPANT_ROW,
    ))

    expect(result?.bookId).toBe('book-a') // not book-old
  })

  it('skips events where user was already in leftOut (continuous adrift)', async () => {
    const alreadyAdrift = {
      ...CAUSE_EVENT,
      bookId: 'neutral-event',
      before: makeScenario(['user-a']), // already leftOut before
      after:  makeScenario(['user-a']), // still leftOut after
      occurredAt: new Date('2026-01-03T00:00:00Z'),
    }
    // alreadyAdrift is newer but should be skipped; CAUSE_EVENT is the real trigger
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [alreadyAdrift, CAUSE_EVENT],
      PARTICIPANT_ROW,
    ))

    expect(result?.bookId).toBe('book-a')
  })

  it('falls back to pseudonym "Участник" when actor has left the session', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT],
      [],  // participant not found
    ))

    expect(result?.actor.pseudonym).toBe('Участник')
  })

  it('returns null when event type is not a known mutation kind', async () => {
    const unknownKindEvent = { ...CAUSE_EVENT, eventType: 'unknown_kind' }
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [unknownKindEvent],
    ))

    expect(result).toBeNull()
  })
})

describe('isViewerAdrift', () => {
  const overview = (leftOutIds: string[]): ScenarioSetOverview => ({
    scenarios: [],
    leader: {
      id: 'l',
      tier: 'leader',
      circles: [],
      leftOut: leftOutIds.map((id) => ({ userId: id, pseudonym: id })),
      score: { coveredCount: 0, totalCount: 0, coverageRatio: 0, strongInterestCount: 0, rankedCount: 0, unrankedCount: 0, rankSum: 0, avgRank: null, worstRank: null },
    },
    totalCount: 1,
    minGroupSize: 2,
    maxGroupSize: 3,
  })

  it('returns true when viewer is in leader leftOut', () => {
    expect(isViewerAdrift(overview(['u1', 'u2']), 'u1')).toBe(true)
  })

  it('returns false when viewer is not in leader leftOut', () => {
    expect(isViewerAdrift(overview(['u2']), 'u1')).toBe(false)
  })

  it('returns false when there is no leader', () => {
    const noLeader: ScenarioSetOverview = { scenarios: [], leader: null, totalCount: 0, minGroupSize: 2, maxGroupSize: 3 }
    expect(isViewerAdrift(noLeader, 'u1')).toBe(false)
  })
})
```

- [ ] **Step 2: Убедиться что тест красный**

```bash
npm test -- lib/matching/__tests__/adrift.test.ts --no-coverage
```

Ожидаем: FAIL — `fetchAdriftCauseForUser is not a function`.

- [ ] **Step 3: Заменить реализацию adrift.ts**

Полностью заменить содержимое `lib/matching/adrift.ts`:

```typescript
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingPreferenceEvents, matchingSessionParticipants } from '@/lib/db/schema'
import { asMatchingScenario, isMatchingMutationKind } from './feed-events'
import type { AdriftCause } from './feed-events'
import type { ScenarioSetOverview } from './scenarios'

/** Сколько событий просматриваем назад при поиске причины */
const SEARCH_LIMIT = 200

/**
 * Читает из matching_preference_events самое недавнее событие, после которого
 * userId впервые оказался в leftOut лидера. Возвращает null, если таких событий нет.
 *
 * Вызывать только когда isViewerAdrift() уже подтвердил, что пользователь за бортом.
 */
export async function fetchAdriftCauseForUser(
  sessionId: string,
  userId: string,
  dbClient: typeof db = db,
): Promise<AdriftCause | null> {
  const rows = await dbClient
    .select({
      actorUserId: matchingPreferenceEvents.actorUserId,
      eventType: matchingPreferenceEvents.eventType,
      bookId: matchingPreferenceEvents.bookId,
      before: matchingPreferenceEvents.before,
      after: matchingPreferenceEvents.after,
      occurredAt: matchingPreferenceEvents.occurredAt,
    })
    .from(matchingPreferenceEvents)
    .where(eq(matchingPreferenceEvents.sessionId, sessionId))
    .orderBy(desc(matchingPreferenceEvents.occurredAt))
    .limit(SEARCH_LIMIT)

  // Идём от новейшего к старейшему: ищем переход "не был в leftOut → стал в leftOut"
  for (const row of rows) {
    const after = asMatchingScenario(row.after)
    const before = asMatchingScenario(row.before)

    const inAfterLeftOut = after?.leftOut.some((p) => p.userId === userId) ?? false
    const inBeforeLeftOut = before?.leftOut.some((p) => p.userId === userId) ?? false

    if (inAfterLeftOut && !inBeforeLeftOut) {
      // Нашли событие-причину
      if (!isMatchingMutationKind(row.eventType)) continue

      const [participant] = await dbClient
        .select({ pseudonym: matchingSessionParticipants.pseudonym })
        .from(matchingSessionParticipants)
        .where(
          and(
            eq(matchingSessionParticipants.sessionId, sessionId),
            eq(matchingSessionParticipants.userId, row.actorUserId),
          ),
        )
        .limit(1)

      return {
        actor: {
          userId: row.actorUserId,
          pseudonym: participant?.pseudonym ?? 'Участник',
        },
        bookId: row.bookId ?? '',
        mutationKind: row.eventType,
        leaderBeforeId: before?.id ?? null,
        leaderAfterId: after?.id ?? null,
        at: row.occurredAt.getTime(),
      }
    }

    // Восстановление: был в leftOut, вышел — дальше назад нет смысла
    if (!inAfterLeftOut && inBeforeLeftOut) break
  }

  return null
}

/** Проверяет, входит ли viewingUserId в список «за бортом» лидера текущего расчёта. */
export function isViewerAdrift(overview: ScenarioSetOverview, viewingUserId: string): boolean {
  const leader = overview.leader
  return !!leader && leader.leftOut.some((participant) => participant.userId === viewingUserId)
}
```

- [ ] **Step 4: Тесты зелёные**

```bash
npm test -- lib/matching/__tests__/adrift.test.ts --no-coverage
```

Ожидаем: все тесты GREEN.

- [ ] **Step 5: Lint + typecheck**

```bash
npm run lint -- lib/matching/adrift.ts lib/matching/__tests__/adrift.test.ts
npm run typecheck
```

Ожидаем: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/adrift.ts lib/matching/__tests__/adrift.test.ts
git commit -m "feat: replace in-memory adrift cause with persistent DB lookup"
```

---

## Task 3: Упрощаем mutation-effects.ts — убираем adrift-write и feedEvents

**Цель:** `finalizeMatchingMutationEffects` больше не пишет в Map и не вычисляет feedEvents (они уже в БД). Остаётся только запись в `matching_preference_events`. Функция становится ~вдвое короче.

**Files:**
- Modify: `lib/matching/mutation-effects.ts`
- Modify: `lib/matching/__tests__/mutation-effects.test.ts`

- [ ] **Step 1: Обновить тест mutation-effects (красный)**

Полностью заменить `lib/matching/__tests__/mutation-effects.test.ts`:

```typescript
import { finalizeMatchingMutationEffects } from '../mutation-effects'
import type { MatchingScenario } from '../scenarios'
import { fetchScenarioContextForSession } from '../scenario-input'
import { recordMatchingPreferenceEvent } from '../preference-events'

jest.mock('../scenario-input', () => ({
  fetchScenarioContextForSession: jest.fn(),
}))
jest.mock('../preference-events', () => ({
  recordMatchingPreferenceEvent: jest.fn(),
}))

const mockFetchContext = fetchScenarioContextForSession as jest.Mock
const mockRecordEvent = recordMatchingPreferenceEvent as jest.Mock

function scenario(id: string, coveredCount: number, leftOut: MatchingScenario['leftOut']): MatchingScenario {
  return {
    id,
    tier: 'leader',
    circles: [],
    leftOut,
    score: {
      coveredCount,
      totalCount: 3,
      coverageRatio: coveredCount / 3,
      strongInterestCount: coveredCount,
      rankedCount: coveredCount,
      unrankedCount: 0,
      rankSum: coveredCount,
      avgRank: 1,
      worstRank: 1,
    },
  }
}

const beforeLeader = scenario('before', 2, [{ userId: 'target', pseudonym: 'Белка' }])
const afterLeader  = scenario('after', 3, [])

const afterContext = {
  participants: [
    { userId: 'actor', pseudonym: 'Лиса' },
    { userId: 'target', pseudonym: 'Белка' },
  ],
  overview: {
    scenarios: [afterLeader],
    leader: afterLeader,
    totalCount: 1,
    minGroupSize: 3,
    maxGroupSize: 3,
  },
  bookTitleById: new Map([['book-1', 'Книга']]),
}

function contextWithLeader(leader: MatchingScenario) {
  return {
    ...afterContext,
    overview: { ...afterContext.overview, scenarios: [leader], leader },
  }
}

describe('finalizeMatchingMutationEffects', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchContext.mockResolvedValue(afterContext)
    mockRecordEvent.mockResolvedValue({ recorded: true, eventId: 'evt-1' })
  })

  it('records persistent analytics for a book mutation', async () => {
    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'actor',
      bookId: 'book-1',
      kind: 'book_added',
      source: 'matching',
      before: { context: contextWithLeader(beforeLeader) },
      metadata: { via: 'test' },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      userId: 'target',
      actorUserId: 'actor',
      eventType: 'book_added',
      source: 'matching',
      bookId: 'book-1',
      before: beforeLeader,
      after: afterLeader,
      metadata: { via: 'test', bookTitle: 'Книга' },
    }))
  })

  it('records analytics even when actor is not a session participant', async () => {
    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'admin',
      bookId: null,
      kind: 'priorities_updated',
      source: 'admin',
      before: { context: contextWithLeader(beforeLeader) },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin',
      eventType: 'priorities_updated',
      source: 'admin',
      bookId: null,
    }))
  })

  it('does nothing when the scenario context is unavailable', async () => {
    mockFetchContext.mockResolvedValue(null)

    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'actor',
      bookId: 'book-1',
      kind: 'book_added',
      source: 'matching',
      before: null,
    })

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Убедиться что тест красный**

```bash
npm test -- lib/matching/__tests__/mutation-effects.test.ts --no-coverage
```

Ожидаем: FAIL (адаптер ещё мокает `buildFeedEventsForMutation`/adrift, которых больше нет).

- [ ] **Step 3: Переписать mutation-effects.ts**

Полностью заменить `lib/matching/mutation-effects.ts`:

```typescript
import type { MatchingMutationKind } from './feed-events'
import type { MatchingScenarioContext } from './scenario-input'
import { fetchScenarioContextForSession } from './scenario-input'
import { recordMatchingPreferenceEvent } from './preference-events'

export interface MatchingMutationSnapshot {
  context: MatchingScenarioContext
}

export interface FinalizeMatchingMutationInput {
  sessionId: string
  targetUserId: string
  actorUserId: string
  bookId: string | null
  kind: MatchingMutationKind
  source: 'matching' | 'catalog' | 'profile' | 'admin'
  before: MatchingMutationSnapshot | null
  metadata?: Record<string, unknown>
}

export async function captureMatchingMutationSnapshot(
  sessionId: string,
): Promise<MatchingMutationSnapshot | null> {
  const context = await fetchScenarioContextForSession(sessionId)
  return context ? { context } : null
}

export async function finalizeMatchingMutationEffects({
  sessionId,
  targetUserId,
  actorUserId,
  bookId,
  kind,
  source,
  before,
  metadata = {},
}: FinalizeMatchingMutationInput): Promise<void> {
  const after = await captureMatchingMutationSnapshot(sessionId)
  if (!after) return

  await recordMatchingPreferenceEvent({
    sessionId,
    userId: targetUserId,
    actorUserId,
    eventType: kind,
    source,
    bookId,
    before: before?.context.overview.leader ?? null,
    after: after.context.overview.leader,
    metadata: {
      ...metadata,
      bookTitle: bookId ? after.context.bookTitleById.get(bookId) ?? null : null,
    },
  })
}
```

- [ ] **Step 4: Тесты зелёные**

```bash
npm test -- lib/matching/__tests__/mutation-effects.test.ts --no-coverage
```

Ожидаем: GREEN.

- [ ] **Step 5: Все unit-тесты проекта**

```bash
npm test --no-coverage
```

Ожидаем: GREEN (в том числе feed.test.ts, adrift.test.ts, mutation-effects.test.ts).

- [ ] **Step 6: Lint + typecheck**

```bash
npm run lint -- lib/matching/mutation-effects.ts lib/matching/__tests__/mutation-effects.test.ts
npm run typecheck
```

Ожидаем: 0 ошибок.

- [ ] **Step 7: Commit**

```bash
git add lib/matching/mutation-effects.ts lib/matching/__tests__/mutation-effects.test.ts
git commit -m "refactor: remove adrift in-memory writes from finalizeMatchingMutationEffects"
```

---

## Task 4: Подключаем fetchAdriftCauseForUser в page.tsx

**Цель:** Страница `/matching` теперь читает причину adrift из БД, а не из пустого Map. Атрибуция «вы выпали из круга после того, как X убрал Y» начинает работать в проде.

**Files:**
- Modify: `app/matching/page.tsx`

- [ ] **Step 1: Обновить импорт в page.tsx**

Найти строку (≈22):
```typescript
import { getAdriftCause, isViewerAdrift } from '@/lib/matching/adrift'
```

Заменить на:
```typescript
import { fetchAdriftCauseForUser, isViewerAdrift } from '@/lib/matching/adrift'
```

- [ ] **Step 2: Заменить синхронный getAdriftCause на async fetchAdriftCauseForUser**

Найти блок (≈173–184):
```typescript
  const adriftCause = getAdriftCause(activeSession.id, viewingUserId)
  const adrift = isViewerAdrift(scenarioSetOverview, viewingUserId)
    ? {
        reason: adriftCause ? 'change' as const : 'never' as const,
        cause: adriftCause
          ? {
              ...adriftCause,
              bookTitle: bookTitleById.get(adriftCause.bookId) ?? null,
            }
          : null,
      }
    : null
```

Заменить на:
```typescript
  const isAdrift = isViewerAdrift(scenarioSetOverview, viewingUserId)
  const adriftCause = isAdrift
    ? await fetchAdriftCauseForUser(activeSession.id, viewingUserId)
    : null
  const adrift = isAdrift
    ? {
        reason: adriftCause ? 'change' as const : 'never' as const,
        cause: adriftCause
          ? {
              ...adriftCause,
              bookTitle: bookTitleById.get(adriftCause.bookId) ?? null,
            }
          : null,
      }
    : null
```

- [ ] **Step 3: Lint + typecheck**

```bash
npm run lint -- app/matching/page.tsx
npm run typecheck
```

Ожидаем: 0 ошибок.

- [ ] **Step 4: Полный прогон unit-тестов + build**

```bash
npm test --no-coverage && npm run build
```

Ожидаем: GREEN / build successful.

- [ ] **Step 5: Commit**

```bash
git add app/matching/page.tsx
git commit -m "fix: read adrift cause from DB instead of in-memory Map"
```

---

## Task 5: PR + merge

**E2E: нужен / не нужен**

Поведение UI идентично — меняется только источник данных. Существующие E2E в `e2e/matching-reader-circles.spec.ts` проверяют работу matching-флоу и должны пройти без изменений (в E2E среда — один процесс, но данные теперь читаются из БД, которая используется и в E2E). Новый E2E-тест на конкретный текст баннера «вы выпали из круга после того, как X убрал Y» был бы ценен, но требует сложного multi-actor сценария — оставляем как backlog-задачу.

**Wiki: не нужна** — внутренняя реализация, пользовательский флоу не меняется.

- [ ] **Step 1: Создать PR**

```bash
git push -u origin fix/adrift-persistent-cause
gh pr create --fill
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 2: Проверить mergeStateStatus**

```bash
gh pr view --json mergeStateStatus,mergeable
```

Ожидаем: `BLOCKED` (CI работает) или `CLEAN`. Если `BEHIND` — `gh pr update-branch`. Если `CONFLICTING` — резолвить вручную.

- [ ] **Step 3: Дождаться CI**

```bash
gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```

Ожидаем: CI зелёный → auto-merge → Vercel деплоит prod.

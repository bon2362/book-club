# Digest Status Widget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a widget to the admin panel showing the current state of the notification digest queue (queue size, debounce status, estimated send time).

**Architecture:** New read-only API endpoint `/api/admin/digest-status` queries `notification_queue` and mirrors the debounce logic from `/api/cron/digest` to compute status. A new client component `DigestStatusWidget` polls this endpoint every 60s following the same pattern as `AdminStatusBar`. The widget is added to `app/admin/page.tsx` alongside `AdminStatusBar`.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, React hooks (useEffect/useCallback), Jest + React Testing Library

---

## Debounce logic (mirrors `app/api/cron/digest/route.ts`)

```
isCooling    = latestCreatedAt > now - 30min
isForcedFlush = oldestCreatedAt < now - 2h

if no rows              → status: 'empty'
if isCooling && !forced → status: 'cooling', sendAt = min(latest+30min, oldest+2h)
else                    → status: 'ready'
```

## File structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/admin/digest-status/route.ts` | GET endpoint — reads queue, computes status |
| Create | `app/api/admin/digest-status/route.test.ts` | Unit tests for the endpoint |
| Create | `components/nd/DigestStatusWidget.tsx` | Client component, polls every 60s |
| Create | `components/nd/DigestStatusWidget.test.tsx` | Unit tests for the component |
| Modify | `app/admin/page.tsx` | Import and render `DigestStatusWidget` |

---

## Chunk 1: API Endpoint

### Task 1: API endpoint — failing tests first

**Files:**
- Create: `app/api/admin/digest-status/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({ notificationQueue: {} }))

const mockAuth = authModule.auth as jest.Mock

function makeSelectMock(rows: { createdAt: Date }[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  }
}

const ago = (ms: number) => new Date(Date.now() - ms)
const MIN = 60_000
const HOUR = 60 * MIN

describe('GET /api/admin/digest-status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает status:empty при пустой очереди', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([]))
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.status).toBe('empty')
  })

  it('возвращает status:ready если все записи старше 30 мин', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(35 * MIN) },
      { createdAt: ago(40 * MIN) },
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('ready')
    expect(data.count).toBe(2)
  })

  it('возвращает status:cooling если последняя запись < 30 мин назад', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(10 * MIN) },
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('cooling')
    expect(data.count).toBe(1)
    expect(typeof data.sendAt).toBe('string')
    // sendAt should be ~20 min from now (10min ago + 30min window)
    const sendAt = new Date(data.sendAt).getTime()
    expect(sendAt).toBeGreaterThan(Date.now() + 15 * MIN)
    expect(sendAt).toBeLessThan(Date.now() + 25 * MIN)
  })

  it('возвращает status:ready при forced flush (старейшая запись > 2 ч)', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(3 * HOUR) },   // oldest > 2h → forced flush
      { createdAt: ago(10 * MIN) },   // latest still cooling
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('ready')
    expect(data.count).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest app/api/admin/digest-status/route.test.ts --no-coverage
```
Expected: `Cannot find module './route'`

---

### Task 2: API endpoint — implementation

**Files:**
- Create: `app/api/admin/digest-status/route.ts`

- [ ] **Step 3: Write implementation**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationQueue } from '@/lib/db/schema'
import { isNull } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({ createdAt: notificationQueue.createdAt })
    .from(notificationQueue)
    .where(isNull(notificationQueue.sentAt))

  if (rows.length === 0) {
    return NextResponse.json({ status: 'empty' })
  }

  const now = Date.now()
  const timestamps = rows.map((r) => r.createdAt.getTime())
  const latestCreatedAt = Math.max(...timestamps)
  const oldestCreatedAt = Math.min(...timestamps)
  const isCooling = latestCreatedAt > now - 30 * 60 * 1000
  const isForcedFlush = oldestCreatedAt < now - 2 * 60 * 60 * 1000

  if (isCooling && !isForcedFlush) {
    const sendAt = new Date(
      Math.min(latestCreatedAt + 30 * 60 * 1000, oldestCreatedAt + 2 * 60 * 60 * 1000)
    ).toISOString()
    return NextResponse.json({ status: 'cooling', count: rows.length, sendAt })
  }

  return NextResponse.json({ status: 'ready', count: rows.length })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest app/api/admin/digest-status/route.test.ts --no-coverage
```
Expected: all 5 tests PASS

- [ ] **Step 5: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/digest-status/route.ts app/api/admin/digest-status/route.test.ts
git commit -m "feat: add /api/admin/digest-status endpoint"
```

---

## Chunk 2: Widget Component

### Task 3: Widget component — failing tests first

**Files:**
- Create: `components/nd/DigestStatusWidget.test.tsx`

- [ ] **Step 7: Write failing tests**

```typescript
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import DigestStatusWidget from './DigestStatusWidget'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

function respondWith(data: object) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  })
}

describe('DigestStatusWidget', () => {
  it('ничего не рендерит пока данные не загружены', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<DigestStatusWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('показывает "очередь пуста" при status:empty', async () => {
    respondWith({ status: 'empty' })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/очередь пуста/i)).toBeInTheDocument()
  })

  it('показывает count при status:ready', async () => {
    respondWith({ status: 'ready', count: 3 })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/готово/i)).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('показывает минуты до отправки при status:cooling', async () => {
    const sendAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
    respondWith({ status: 'cooling', count: 1, sendAt })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/ожидание/i)).toBeInTheDocument()
    expect(screen.getByText(/20 мин/i)).toBeInTheDocument()
  })

  it('делает повторный запрос каждые 60 секунд', async () => {
    respondWith({ status: 'empty' })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 8: Run tests — verify they fail**

```bash
npx jest components/nd/DigestStatusWidget.test.tsx --no-coverage
```
Expected: `Cannot find module './DigestStatusWidget'`

---

### Task 4: Widget component — implementation

**Files:**
- Create: `components/nd/DigestStatusWidget.tsx`

- [ ] **Step 9: Write implementation**

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'

type DigestStatusData =
  | { status: 'empty' }
  | { status: 'ready'; count: number }
  | { status: 'cooling'; count: number; sendAt: string }

function minutesUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 60_000))
}

const SPAN_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
}

export default function DigestStatusWidget() {
  const [data, setData] = useState<DigestStatusData | null>(null)

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/admin/digest-status')
    if (res.ok) setData(await res.json())
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  if (!data) return null

  const dot =
    data.status === 'ready' ? (
      <span style={{ color: '#22c55e' }}>●</span>
    ) : data.status === 'cooling' ? (
      <span style={{ color: '#f59e0b' }}>●</span>
    ) : (
      <span style={{ color: '#9ca3af' }}>●</span>
    )

  let label: string
  if (data.status === 'empty') {
    label = 'Дайджест: очередь пуста'
  } else if (data.status === 'ready') {
    label = `Дайджест: готово · ${data.count} зап.`
  } else {
    label = `Дайджест: ожидание · ${data.count} зап. · отправка через ${minutesUntil(data.sendAt)} мин`
  }

  return (
    <span style={SPAN_STYLE}>
      {dot}
      <span>{label}</span>
    </span>
  )
}
```

- [ ] **Step 10: Run tests — verify they pass**

```bash
npx jest components/nd/DigestStatusWidget.test.tsx --no-coverage
```
Expected: all 5 tests PASS

- [ ] **Step 11: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```
Expected: no errors

- [ ] **Step 12: Commit**

```bash
git add components/nd/DigestStatusWidget.tsx components/nd/DigestStatusWidget.test.tsx
git commit -m "feat: add DigestStatusWidget component"
```

---

## Chunk 3: Integration

### Task 5: Add widget to admin page

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 13: Read the file**

Read `app/admin/page.tsx` to find where `AdminStatusBar` is rendered (around line 122).

- [ ] **Step 14: Add import and render widget**

In `app/admin/page.tsx`:

1. Add import after the existing `AdminStatusBar` import:
```typescript
import DigestStatusWidget from '@/components/nd/DigestStatusWidget'
```

2. Right after `<AdminStatusBar />`, add:
```tsx
<DigestStatusWidget />
```

- [ ] **Step 15: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```
Expected: no errors

- [ ] **Step 16: Run full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 17: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: integrate DigestStatusWidget into admin panel"
```

- [ ] **Step 18: Push and verify CI**

```bash
git push
```
Then check GitHub Actions — CI должен пройти зелёным.

---

## Future: если GitHub Actions окажется ненадёжным

Перейти на **cron-job.org**:
1. Зарегистрироваться на cron-job.org (бесплатно)
2. Создать задачу: `GET https://www.slowreading.club/api/cron/digest`, интервал 10 мин, заголовок `Authorization: Bearer <CRON_SECRET>`
3. Отключить `.github/workflows/digest.yml` (или оставить как резервный, поменяв расписание на `0 * * * *`)
4. Опционально: добавить таблицу `digest_runs` и логировать каждый запуск прямо в эндпоинте — тогда виджет сможет показывать "последний запуск: 3 мин назад"

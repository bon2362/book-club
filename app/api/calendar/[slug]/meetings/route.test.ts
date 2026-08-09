/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { fetchCalendarPublicState } from '@/lib/calendar/public-state'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/calendar/public-state', () => ({
  fetchCalendarPublicState: jest.fn(),
  isMissingCalendarSchemaError: (error: unknown) => (error as { code?: string })?.code === '42P01',
}))
jest.mock('@/lib/calendar/schedule-db', () => ({ resolveScheduleBySlug: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: {} }))

const mockAuth = auth as jest.Mock
const mockResolve = resolveScheduleBySlug as jest.Mock
const mockState = fetchCalendarPublicState as jest.Mock
const mockWithAuditContext = withAuditContext as jest.Mock

const SLUG = 'zarya-vsego'
const DAY = '2026-08-11T'

function request(startsAt: string) {
  return new NextRequest(`http://localhost/api/calendar/${SLUG}/meetings`, {
    method: 'POST',
    body: JSON.stringify({ startsAt }),
  })
}

function session(isAdmin = false) {
  return { user: { id: 'user-1', name: 'Reader', contactEmail: 'reader@example.test', isAdmin } }
}

/** Двое отметившихся свободны 14:00–16:00, третий не заходил. */
function state(overrides: Record<string, unknown> = {}) {
  const shared = [{ startsAt: `${DAY}14:00:00.000Z`, endsAt: `${DAY}16:00:00.000Z` }]
  return {
    slug: SLUG,
    book: { title: 'Заря всего', author: null },
    circleExists: true,
    durationMinutes: 60,
    window: { start: `${DAY}00:00:00.000Z`, end: '2026-09-08T00:00:00.000Z' },
    now: `${DAY}09:00:00.000Z`,
    participants: [
      { ref: 'a', intervals: shared, busy: [] },
      { ref: 'b', intervals: shared, busy: [] },
      { ref: 'c', intervals: [], busy: [] },
    ],
    meetings: [],
    viewer: { ref: 'a', canEdit: true, isAdmin: false, actingAsRef: 'a' },
    migrationRequired: false,
    ...overrides,
  }
}

/** Транзакция подменяется объектом, который умеет ровно то, что нужно роуту. */
function runInTransaction(insert: jest.Mock) {
  mockWithAuditContext.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({
    execute: jest.fn().mockResolvedValue(undefined),
    insert,
  }))
}

function insertSpy() {
  const returning = jest.fn().mockResolvedValue([{ id: 'meeting-1' }])
  const values = jest.fn().mockReturnValue({ returning })
  const insert = jest.fn().mockReturnValue({ values })
  return { insert, values, returning }
}

describe('POST /api/calendar/[slug]/meetings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(session())
    mockResolve.mockResolvedValue({ id: 'schedule-1', circleId: 'circle-1', durationMinutes: 60 })
  })

  it('требует авторизации', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })
    expect(res.status).toBe(401)
  })

  it('отклоняет неразбираемое начало встречи', async () => {
    const res = await POST(request('не дата'), { params: { slug: SLUG } })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_start' })
  })

  it('отвечает 404 на неизвестный адрес', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })
    expect(res.status).toBe(404)
  })

  it('создаёт встречу на клетке-кандидате', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state())

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, id: 'meeting-1' })
    expect(spy.values).toHaveBeenCalledWith(expect.objectContaining({
      scheduleId: 'schedule-1',
      durationMinutes: 60,
      createdBy: 'user-1',
    }))
  })

  it('перепроверяет правило кандидата на сервере и отклоняет слот без полного пересечения', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state({
      participants: [
        { ref: 'a', intervals: [{ startsAt: `${DAY}14:00:00.000Z`, endsAt: `${DAY}16:00:00.000Z` }], busy: [] },
        { ref: 'b', intervals: [{ startsAt: `${DAY}18:00:00.000Z`, endsAt: `${DAY}19:00:00.000Z` }], busy: [] },
      ],
    }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'not_a_candidate' })
    expect(spy.insert).not.toHaveBeenCalled()
  })

  it('отклоняет слот в прошлом', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state({ now: `${DAY}15:00:00.000Z` }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(409)
    expect(spy.insert).not.toHaveBeenCalled()
  })

  it('отклоняет слот, пересекающийся с уже назначенной встречей круга', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state({
      meetings: [{ id: 'm1', startsAt: `${DAY}14:30:00.000Z`, durationMinutes: 60, canceledAt: null }],
    }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(409)
    expect(spy.insert).not.toHaveBeenCalled()
  })

  it('не даёт назначать в распавшемся круге', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state({ circleExists: false }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'circle_gone' })
  })

  it('отклоняет запрос от постороннего', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockState.mockResolvedValue(state({ viewer: { ref: null, canEdit: false, isAdmin: false, actingAsRef: null } }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_a_member' })
  })

  it('проверяет кандидата и вставляет строку в одной транзакции, заблокировав пространство', async () => {
    const spy = insertSpy()
    const execute = jest.fn().mockResolvedValue(undefined)
    mockWithAuditContext.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({
      execute,
      insert: spy.insert,
    }))
    mockState.mockResolvedValue(state())

    await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    // Состояние читается тем же соединением, что и вставка, иначе проверка бессмысленна.
    expect(mockState).toHaveBeenCalledWith(expect.objectContaining({ skipCleanup: true }), expect.objectContaining({ execute }))
    expect(execute).toHaveBeenCalled()
  })

  it('до прогона миграции отвечает 409, а не пятисоткой', async () => {
    mockResolve.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }))

    const res = await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'migration_required' })
  })

  it('записывает административный источник в аудит', async () => {
    const spy = insertSpy()
    runInTransaction(spy.insert)
    mockAuth.mockResolvedValue(session(true))
    mockState.mockResolvedValue(state())

    await POST(request(`${DAY}14:00:00.000Z`), { params: { slug: SLUG } })

    expect(mockWithAuditContext).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', source: 'admin' }),
      expect.any(Function),
      expect.anything(),
    )
  })
})

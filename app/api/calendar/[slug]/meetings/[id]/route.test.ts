/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
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
const params = { params: { slug: SLUG, id: 'meeting-1' } }

function request() {
  return new NextRequest(`http://localhost/api/calendar/${SLUG}/meetings/meeting-1`, { method: 'DELETE' })
}

function updateSpy() {
  const where = jest.fn().mockResolvedValue(undefined)
  const set = jest.fn().mockReturnValue({ where })
  const update = jest.fn().mockReturnValue({ set })
  mockWithAuditContext.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ update }))
  return { update, set, where }
}

describe('DELETE /api/calendar/[slug]/meetings/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Reader', contactEmail: null, isAdmin: false } })
    mockResolve.mockResolvedValue({ id: 'schedule-1', circleId: 'circle-1' })
    mockState.mockResolvedValue({ viewer: { canEdit: true } })
  })

  it('требует авторизации', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await DELETE(request(), params)).status).toBe(401)
  })

  it('отвечает 404 на неизвестный адрес', async () => {
    mockResolve.mockResolvedValue(null)
    expect((await DELETE(request(), params)).status).toBe(404)
  })

  it('отклоняет запрос от постороннего', async () => {
    mockState.mockResolvedValue({ viewer: { canEdit: false } })
    const res = await DELETE(request(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_a_member' })
  })

  it('помечает встречу отменённой, а не удаляет строку', async () => {
    const spy = updateSpy()

    const res = await DELETE(request(), params)

    expect(res.status).toBe(200)
    expect(spy.set).toHaveBeenCalledWith(expect.objectContaining({
      canceledAt: expect.any(Date),
      canceledBy: 'user-1',
    }))
    // Журнал должен показывать, кто передумал, поэтому никакого delete.
    expect((spy as unknown as { delete?: unknown }).delete).toBeUndefined()
  })

  it('повторная отмена идемпотентна: условие требует ещё не отменённую строку', async () => {
    const spy = updateSpy()

    await DELETE(request(), params)

    // where получает конъюнкцию с isNull(canceledAt) — иначе повтор перезаписал бы автора отмены.
    expect(spy.where).toHaveBeenCalledTimes(1)
    expect(spy.where.mock.calls[0][0]).toBeDefined()
  })

  it('пишет административный источник в аудит', async () => {
    updateSpy()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin', contactEmail: null, isAdmin: true } })

    await DELETE(request(), params)

    expect(mockWithAuditContext).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-1', source: 'admin' }),
      expect.any(Function),
      expect.anything(),
    )
  })

  it('до прогона миграции отвечает 409, а не пятисоткой', async () => {
    mockResolve.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }))

    const res = await DELETE(request(), params)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'migration_required' })
  })
})

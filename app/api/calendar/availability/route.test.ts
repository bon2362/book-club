/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { PUT } from './route'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: {} }))

const mockAuth = auth as jest.Mock
const mockWithAuditContext = withAuditContext as jest.MockedFunction<typeof withAuditContext>

function request(body: unknown, query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/calendar/availability${query}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function session(isAdmin = false) {
  return {
    user: {
      id: 'user-1',
      name: 'Reader',
      contactEmail: 'reader@example.test',
      isAdmin,
    },
  }
}

// Роут обрезает интервалы по окну, которое начинается «сейчас», а даты в тестах
// зашиты абсолютно. Без замороженного времени набор проходил только до
// 2026-08-10T10:00Z, а потом валил CI на любом PR. Время фиксируем явно.
const FROZEN_NOW = new Date('2026-08-10T08:00:00.000Z')

describe('/api/calendar/availability', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    jest.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('requires authentication', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await PUT(request({ intervals: [] }))

    expect(res.status).toBe(401)
  })

  it('rejects editing another user unless viewer is admin', async () => {
    mockAuth.mockResolvedValue(session(false))

    const res = await PUT(request({ intervals: [] }, '?as=user-2'))

    expect(res.status).toBe(403)
  })

  it('validates interval shape and slot alignment', async () => {
    mockAuth.mockResolvedValue(session(true))

    const invalidShape = await PUT(request({ intervals: 'nope' }))
    const unaligned = await PUT(request({
      intervals: [{ startsAt: '2026-08-10T10:15:00.000Z', endsAt: '2026-08-10T11:00:00.000Z' }],
    }))

    expect(invalidShape.status).toBe(400)
    expect(await invalidShape.json()).toEqual({ error: 'invalid_intervals' })
    expect(unaligned.status).toBe(400)
    expect(await unaligned.json()).toEqual({ error: 'unaligned_interval' })
  })

  it('saves normalized intervals through audit context', async () => {
    mockAuth.mockResolvedValue(session(false))
    mockWithAuditContext.mockImplementation(async (_context, callback) => {
      const tx = {
        delete: jest.fn(() => ({
          where: jest.fn(),
        })),
        insert: jest.fn(() => ({
          values: jest.fn(),
        })),
      }
      await callback(tx as never)
    })

    const res = await PUT(request({
      intervals: [
        { startsAt: '2026-08-10T10:00:00.000Z', endsAt: '2026-08-10T11:00:00.000Z' },
        { startsAt: '2026-08-10T11:00:00.000Z', endsAt: '2026-08-10T11:30:00.000Z' },
      ],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.intervals).toEqual([
      { startsAt: '2026-08-10T10:00:00.000Z', endsAt: '2026-08-10T11:30:00.000Z' },
    ])
    expect(mockWithAuditContext).toHaveBeenCalled()
  })
})

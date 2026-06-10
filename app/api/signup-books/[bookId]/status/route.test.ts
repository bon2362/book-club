/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  signupBooks: {},
}))
jest.mock('@/lib/matching/realtime/state-change', () => ({
  broadcastActiveMatchingStateChangeForParticipant: jest.fn(),
  getActiveMatchingSessionIdForParticipant: jest.fn(),
}))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn(),
  finalizeMatchingMutationEffects: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockBroadcastMatchingStateChange = broadcastActiveMatchingStateChangeForParticipant as jest.Mock
const mockGetActiveSessionId = getActiveMatchingSessionIdForParticipant as jest.Mock

function makeReq(body: object, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/signup-books/book-1/status${suffix}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }
const params = { params: { bookId: 'book-1' } }

describe('PATCH /api/signup-books/[bookId]/status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetActiveSessionId.mockResolvedValue(null)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PATCH(makeReq({ status: 'reading' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await PATCH(makeReq({ status: 'queued' }), params)
    expect(res.status).toBe(400)
  })

  it('returns 404 when user is not signed up for the book', async () => {
    mockAuth.mockResolvedValue(userSession)
    const signupChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(signupChain)

    const res = await PATCH(makeReq({ status: 'read' }), params)
    expect(res.status).toBe(404)
  })

  it('updates status and asks matching to broadcast for session participants', async () => {
    mockAuth.mockResolvedValue(userSession)
    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'book-1' }]),
    }
    mockDb.select = jest.fn().mockReturnValueOnce(signupChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await PATCH(makeReq({ status: 'reading' }), params)

    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalled()
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('user1')
  })

  it('lets admin update status for an impersonated participant', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'book-1' }]),
    }
    mockDb.select = jest.fn().mockReturnValueOnce(signupChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await PATCH(makeReq({ status: 'read' }, 'participant1'), params)

    expect(res.status).toBe(200)
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('participant1')
  })

  it('rejects non-admin impersonated mutations', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await PATCH(makeReq({ status: 'read' }, 'participant1'), params)
    expect(res.status).toBe(403)
  })
})

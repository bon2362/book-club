/**
 * @jest-environment node
 */
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import * as mutationEffects from '@/lib/matching/mutation-effects'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), delete: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn(),
  finalizeMatchingMutationEffects: jest.fn(),
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  signupBooks: {},
  bookPriorities: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockCaptureSnapshot = mutationEffects.captureMatchingMutationSnapshot as jest.Mock
const mockFinalizeEffects = mutationEffects.finalizeMatchingMutationEffects as jest.Mock

function makeReq(bookId: string, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/books/${bookId}${suffix}`, {
    method: 'DELETE',
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }

describe('DELETE /api/matching/books/[bookId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCaptureSnapshot.mockResolvedValue({ context: { overview: { leader: null } } })
    mockFinalizeEffects.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeReq('b1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when no active session', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await DELETE(makeReq('b1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(404)
  })

  it('returns 409 when session is frozen', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'frozen' }]) }
    mockDb.select = jest.fn().mockReturnThis()
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await DELETE(makeReq('b1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(409)
  })

  it('returns 200, deletes signup and priority, normalizes ranks', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const remainingChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockResolvedValue([{ bookId: 'b2' }, { bookId: 'b3' }]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(remainingChain)
    const deleteChain = { where: jest.fn().mockResolvedValue([]) }
    mockDb.delete = jest.fn().mockReturnValue(deleteChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await DELETE(makeReq('b1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(200)
    expect(mockDb.delete).toHaveBeenCalledTimes(2)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    expect(mockFinalizeEffects).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      targetUserId: 'user1',
      actorUserId: 'user1',
      bookId: 'b1',
      kind: 'book_removed',
      source: 'matching',
    }))
  })

  it('lets admin delete a book for an impersonated participant', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const remainingChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(remainingChain)
    const deleteChain = { where: jest.fn().mockResolvedValue([]) }
    mockDb.delete = jest.fn().mockReturnValue(deleteChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await DELETE(makeReq('b1', 'participant1'), { params: { bookId: 'b1' } })

    expect(res.status).toBe(200)
    expect(mockDb.delete).toHaveBeenCalledTimes(2)
    expect(mockFinalizeEffects).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'participant1',
      actorUserId: 'admin1',
      source: 'admin',
    }))
  })

  it('rejects non-admin impersonated mutations', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await DELETE(makeReq('b1', 'participant1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(403)
  })
})

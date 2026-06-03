/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import * as mutationEffects from '@/lib/matching/mutation-effects'
import { bookPriorities, signupBooks } from '@/lib/db/schema'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn(),
  finalizeMatchingMutationEffects: jest.fn(),
}))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  signupBooks: {},
  bookPriorities: { userId: 'bookPriorities.userId', bookId: 'bookPriorities.bookId', rank: 'bookPriorities.rank' },
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockCaptureSnapshot = mutationEffects.captureMatchingMutationSnapshot as jest.Mock
const mockFinalizeEffects = mutationEffects.finalizeMatchingMutationEffects as jest.Mock

function makeReq(body: object, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/books${suffix}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }

describe('POST /api/matching/books', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCaptureSnapshot.mockResolvedValue({ context: { overview: { leader: null } } })
    mockFinalizeEffects.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeReq({ bookId: 'b1' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when no active session', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq({ bookId: 'b1' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when session is frozen', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'frozen' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq({ bookId: 'b1' }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when bookId missing', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 200, inserts book, and promotes it to rank 1', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionSelect = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const prioritiesSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([{ bookId: 'b2' }, { bookId: 'b1' }, { bookId: 'b3' }]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(prioritiesSelect)
    const insertChain = { values: jest.fn().mockReturnThis(), onConflictDoNothing: jest.fn().mockResolvedValue([]) }
    const priorityInsertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue([]),
    }
    mockDb.insert = jest.fn((table) => (
      table === signupBooks ? insertChain : priorityInsertChain
    )) as unknown as typeof mockDb.insert

    const res = await POST(makeReq({ bookId: 'b1' }))

    expect(res.status).toBe(200)
    expect(mockDb.insert).toHaveBeenCalledWith(signupBooks)
    expect(mockDb.insert).toHaveBeenCalledWith(bookPriorities)
    expect(priorityInsertChain.values).toHaveBeenNthCalledWith(1, { userId: 'user1', bookId: 'b1', rank: 1 })
    expect(priorityInsertChain.values).toHaveBeenNthCalledWith(2, { userId: 'user1', bookId: 'b2', rank: 2 })
    expect(priorityInsertChain.values).toHaveBeenNthCalledWith(3, { userId: 'user1', bookId: 'b3', rank: 3 })
    expect(mockFinalizeEffects).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      targetUserId: 'user1',
      actorUserId: 'user1',
      bookId: 'b1',
      kind: 'book_added',
      source: 'matching',
    }))
  })

  it('lets admin add and promote a book for an impersonated participant', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionSelect = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const prioritiesSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([{ bookId: 'b2' }]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(prioritiesSelect)
    const insertChain = { values: jest.fn().mockReturnThis(), onConflictDoNothing: jest.fn().mockResolvedValue([]) }
    const priorityInsertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue([]),
    }
    mockDb.insert = jest.fn((table) => (
      table === signupBooks ? insertChain : priorityInsertChain
    )) as unknown as typeof mockDb.insert

    const res = await POST(makeReq({ bookId: 'b1' }, 'participant1'))

    expect(res.status).toBe(200)
    expect(insertChain.values).toHaveBeenCalledWith({ userId: 'participant1', bookId: 'b1' })
    expect(priorityInsertChain.values).toHaveBeenNthCalledWith(1, { userId: 'participant1', bookId: 'b1', rank: 1 })
    expect(mockFinalizeEffects).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'participant1',
      actorUserId: 'admin1',
      source: 'admin',
    }))
  })

  it('rejects non-admin impersonated mutations', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await POST(makeReq({ bookId: 'b1' }, 'participant1'))
    expect(res.status).toBe(403)
  })
})

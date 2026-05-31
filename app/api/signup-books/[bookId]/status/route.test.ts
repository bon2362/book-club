/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { broadcast } from '@/lib/matching/realtime/hub'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  signupBooks: {},
}))
jest.mock('@/lib/matching/realtime/hub', () => ({ broadcast: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockBroadcast = broadcast as jest.Mock

function makeReq(body: object) {
  return new Request('http://localhost/api/signup-books/book-1/status', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }
const params = { params: { bookId: 'book-1' } }

describe('PATCH /api/signup-books/[bookId]/status', () => {
  beforeEach(() => jest.clearAllMocks())

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

  it('updates status and broadcasts matching state changes for the active session', async () => {
    mockAuth.mockResolvedValue(userSession)
    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'book-1' }]),
    }
    const activeSessionChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(signupChain)
      .mockReturnValueOnce(activeSessionChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await PATCH(makeReq({ status: 'reading' }), params)

    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalled()
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
      userId: 'user1',
      kind: 'personal_status_updated',
      bookId: 'book-1',
      status: 'reading',
    })
  })
})

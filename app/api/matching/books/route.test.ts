/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  signupBooks: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(body: object) {
  return new Request('http://localhost/api/matching/books', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }

describe('POST /api/matching/books', () => {
  beforeEach(() => jest.clearAllMocks())

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

  it('returns 200 and inserts book', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const insertChain = { values: jest.fn().mockReturnThis(), onConflictDoNothing: jest.fn().mockResolvedValue([]) }
    mockDb.insert = jest.fn().mockReturnValue(insertChain)
    const res = await POST(makeReq({ bookId: 'b1' }))
    expect(res.status).toBe(200)
    expect(mockDb.insert).toHaveBeenCalled()
  })
})

/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  bookPriorities: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(body: object, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/priorities${suffix}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }

describe('PATCH /api/matching/priorities', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PATCH(makeReq({ bookIds: ['b1'] }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when no active session', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await PATCH(makeReq({ bookIds: ['b1'] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when session is frozen', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'frozen' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await PATCH(makeReq({ bookIds: ['b1'] }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when bookIds is empty', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await PATCH(makeReq({ bookIds: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when bookIds contains non-strings', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await PATCH(makeReq({ bookIds: [1, 2] }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with canonical ranks', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const canonicalChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ bookId: 'b2', rank: 1 }, { bookId: 'b1', rank: 2 }]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(canonicalChain)
    const upsertChain = { values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockResolvedValue([]) }
    mockDb.insert = jest.fn().mockReturnValue(upsertChain)

    const res = await PATCH(makeReq({ bookIds: ['b2', 'b1'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ranks).toHaveLength(2)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })

  it('lets admin reorder books for an impersonated participant', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const canonicalChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ bookId: 'b2', rank: 1 }]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(canonicalChain)
    const upsertChain = { values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockResolvedValue([]) }
    mockDb.insert = jest.fn().mockReturnValue(upsertChain)

    const res = await PATCH(makeReq({ bookIds: ['b2'] }, 'participant1'))

    expect(res.status).toBe(200)
    expect(upsertChain.values).toHaveBeenCalledWith({ userId: 'participant1', bookId: 'b2', rank: 1 })
  })

  it('rejects non-admin impersonated mutations', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await PATCH(makeReq({ bookIds: ['b1'] }, 'participant1'))
    expect(res.status).toBe(403)
  })
})

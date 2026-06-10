/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { bumpSessionState } from '@/lib/matching/realtime/version'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
  signupBooks: {},
  bookPriorities: {},
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockBump = bumpSessionState as jest.Mock

const adminSession = { user: { id: 'admin1', isAdmin: true } }
const userSession = { user: { id: 'user1', isAdmin: false } }
const params = { params: { id: 'session-1' } }

function makeReq(body: object) {
  return new Request('http://localhost/api/matching/sessions/session-1/mode', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

function chain(value: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(value),
  }
}

function listChain(value: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(value),
  }
}

describe('PATCH /api/matching/sessions/[id]/mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue(userSession)

    const res = await PATCH(makeReq({ optimizationMode: 'satisfaction' }), params)

    expect(res.status).toBe(403)
  })

  it('rejects invalid optimizationMode', async () => {
    mockAuth.mockResolvedValue(adminSession)

    const res = await PATCH(makeReq({ optimizationMode: 'fast' }), params)

    expect(res.status).toBe(400)
  })

  it('rejects frozen sessions', async () => {
    mockAuth.mockResolvedValue(adminSession)
    mockDb.select = jest.fn()
      .mockReturnValueOnce(chain([{ id: 'session-1', status: 'frozen', optimizationMode: 'coverage' }]))

    const res = await PATCH(makeReq({ optimizationMode: 'satisfaction' }), params)

    expect(res.status).toBe(409)
  })

  it('rejects switching when a participant has no ranked active books', async () => {
    mockAuth.mockResolvedValue(adminSession)
    mockDb.select = jest.fn()
      .mockReturnValueOnce(chain([{ id: 'session-1', status: 'active', optimizationMode: 'coverage' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1' }, { userId: 'u2' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1', rank: 1 }]))

    const res = await PATCH(makeReq({ optimizationMode: 'satisfaction' }), params)

    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/приоритет/)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('rejects switching when an active signup has no priority rank', async () => {
    mockAuth.mockResolvedValue(adminSession)
    mockDb.select = jest.fn()
      .mockReturnValueOnce(chain([{ id: 'session-1', status: 'active', optimizationMode: 'coverage' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1' }, { userId: 'u1', bookId: 'b2' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1', rank: 1 }]))

    const res = await PATCH(makeReq({ optimizationMode: 'satisfaction' }), params)

    expect(res.status).toBe(409)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('updates mode and broadcasts state change when all participant books are ranked', async () => {
    mockAuth.mockResolvedValue(adminSession)
    mockDb.select = jest.fn()
      .mockReturnValueOnce(chain([{ id: 'session-1', status: 'active', optimizationMode: 'coverage' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1' }, { userId: 'u2' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1' }, { userId: 'u2', bookId: 'b2' }]))
      .mockReturnValueOnce(listChain([{ userId: 'u1', bookId: 'b1', rank: 1 }, { userId: 'u2', bookId: 'b2', rank: 1 }]))
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await PATCH(makeReq({ optimizationMode: 'satisfaction' }), params)

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith({ optimizationMode: 'satisfaction' })
    expect(mockBump).toHaveBeenCalledWith('session-1')
    const json = await res.json()
    expect(json.optimizationMode).toBe('satisfaction')
  })
})

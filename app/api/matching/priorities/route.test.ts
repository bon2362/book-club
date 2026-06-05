/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { finalizeMatchingMutationEffects } from '@/lib/matching/mutation-effects'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  bookPriorities: {},
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn().mockResolvedValue(null),
  finalizeMatchingMutationEffects: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockFinalizeEffects = finalizeMatchingMutationEffects as jest.Mock

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

  it('пишет событие priorities_updated с упорядоченным списком (source=matching)', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const canonicalChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ bookId: 'b2', rank: 1 }, { bookId: 'b1', rank: 2 }]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(canonicalChain)
    mockDb.insert = jest.fn().mockReturnValue({ values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockResolvedValue([]) })

    await PATCH(makeReq({ bookIds: ['b2', 'b1'] }))

    expect(mockFinalizeEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        targetUserId: 'user1',
        actorUserId: 'user1',
        kind: 'priorities_updated',
        source: 'matching',
        metadata: { rankedBookIds: ['b2', 'b1'] },
      }),
    )
  })

  it('для impersonation: target — участник, actor — админ', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) }
    const canonicalChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ bookId: 'b2', rank: 1 }]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(canonicalChain)
    mockDb.insert = jest.fn().mockReturnValue({ values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockResolvedValue([]) })

    await PATCH(makeReq({ bookIds: ['b2'] }, 'participant1'))

    expect(mockFinalizeEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: 'participant1',
        actorUserId: 'admin1',
        kind: 'priorities_updated',
        source: 'matching',
      }),
    )
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

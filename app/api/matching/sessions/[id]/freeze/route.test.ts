/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as scenarioModule from '@/lib/matching/scenarios'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
  signupBooks: {},
  bookPriorities: {},
  books: {},
}))
jest.mock('@/lib/matching/scenarios', () => ({
  filterSignupsByMode: jest.fn((signups) => signups),
  generateScenarioSets: jest.fn().mockReturnValue({
    scenarios: [],
    leader: null,
    totalCount: 0,
    minGroupSize: 3,
    maxGroupSize: 3,
    mode: 'coverage',
  }),
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockGenerateScenarioSets = scenarioModule.generateScenarioSets as jest.Mock

function makeReq(id: string) {
  return new Request(`http://localhost/api/matching/sessions/${id}/freeze`, {
    method: 'POST',
  }) as unknown as import('next/server').NextRequest
}

const adminSession = { user: { id: 'admin1', isAdmin: true } }

describe('POST /api/matching/sessions/[id]/freeze', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when session not found', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq('bad'), { params: { id: 'bad' } })
    expect(res.status).toBe(404)
  })

  it('returns 409 when already frozen', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'frozen', minGroupSize: 3, maxGroupSize: 3, createdAt: new Date() }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(409)
  })

  it('returns 422 when no participants', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active', minGroupSize: 3, maxGroupSize: 3, createdAt: new Date() }]) }
    const emptyChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValue(emptyChain)
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(422)
  })

  it('returns 200 and updates session on success', async () => {
    mockAuth.mockResolvedValue(adminSession)
    let selectCallCount = 0
    mockDb.select = jest.fn().mockImplementation(() => {
      const instance = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) return Promise.resolve([{ id: 's1', status: 'active', minGroupSize: 3, maxGroupSize: 3, createdAt: new Date() }])
          return Promise.resolve([{ userId: 'u1' }])
        }),
      }
      // For queries without .limit (signups, ranks, books)
      instance.where = jest.fn().mockReturnValue({
        ...instance,
        then: (resolve: (v: unknown[]) => void) => Promise.resolve([]).then(resolve),
        limit: instance.limit,
      })
      return instance
    })
    // Override for Promise.all queries
    mockDb.select = jest.fn()
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active', minGroupSize: 3, maxGroupSize: 3, createdAt: new Date() }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ userId: 'u1' }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) })

    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('freezes the full leader scenario and computes metrics from all leader circles', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const leader = {
      id: 'leader',
      tier: 'leader',
      circles: [
        {
          id: 'b1:u1,u2,u3',
          bookId: 'b1',
          title: 'Book 1',
          members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
          wantsCount: 3,
        },
        {
          id: 'b2:u4,u5,u6',
          bookId: 'b2',
          title: 'Book 2',
          members: [{ userId: 'u4' }, { userId: 'u5' }, { userId: 'u6' }],
          wantsCount: 2,
        },
      ],
      leftOut: [],
      score: {
        coveredCount: 6,
        totalCount: 6,
        strongInterestCount: 5,
        avgRank: 1.2,
        worstRank: 3,
        unrankedCount: 0,
      },
    }
    mockGenerateScenarioSets.mockReturnValue({
      scenarios: [leader],
      leader,
      totalCount: 6,
      minGroupSize: 3,
      maxGroupSize: 3,
      mode: 'satisfaction',
    })
    mockDb.select = jest.fn()
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active', minGroupSize: 3, maxGroupSize: 3, optimizationMode: 'satisfaction', createdAt: new Date() }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }, { userId: 'u4' }, { userId: 'u5' }, { userId: 'u6' }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([
        { userId: 'u1', bookId: 'b1', personalStatus: null },
        { userId: 'u2', bookId: 'b1', personalStatus: null },
        { userId: 'u3', bookId: 'b1', personalStatus: null },
        { userId: 'u4', bookId: 'b2', personalStatus: null },
        { userId: 'u5', bookId: 'b2', personalStatus: null },
        { userId: 'u6', bookId: 'b2', personalStatus: null },
      ]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([
        { id: 'b1', readingStatus: null },
        { id: 'b2', readingStatus: null },
      ]) })

    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await POST(makeReq('s1'), { params: { id: 's1' } })

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      frozenScenarioJson: leader,
      metricGroupsCount: 2,
      metricCoverage: 6,
      metricTop3HitRate: 5 / 6,
    }))
  })
})

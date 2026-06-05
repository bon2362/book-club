/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
  signupBooks: {},
  bookPriorities: {},
  books: {},
}))
jest.mock('@/lib/matching/personal-list', () => ({
  fetchCatalogWithPersonalData: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/matching/my-moves', () => ({
  fetchMyMoves: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/matching/scenarios', () => ({
  emptyScenarioOverview: jest.fn((participants, minGroupSize, maxGroupSize) => ({
    current: [],
    candidates: [],
    leftOut: participants,
    coveredCount: 0,
    totalCount: participants.length,
    minGroupSize,
    maxGroupSize,
  })),
  emptyScenarioSetOverview: jest.fn((participants, minGroupSize, maxGroupSize) => ({
    scenarios: [],
    leader: null,
    totalCount: participants.length,
    minGroupSize,
    maxGroupSize,
  })),
  generateScenarioOverview: jest.fn().mockReturnValue({
    current: [],
    candidates: [],
    leftOut: [],
    coveredCount: 0,
    totalCount: 0,
    minGroupSize: 3,
    maxGroupSize: 3,
  }),
  generateScenarioSets: jest.fn().mockReturnValue({
    scenarios: [],
    leader: null,
    totalCount: 0,
    minGroupSize: 3,
    maxGroupSize: 3,
  }),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(sessionId: string, asParam?: string) {
  const urlStr = `http://localhost/api/matching/state?session=${sessionId}${asParam ? `&as=${asParam}` : ''}`
  const url = new URL(urlStr)
  const req = new Request(urlStr) as unknown as import('next/server').NextRequest
  ;(req as unknown as { nextUrl: URL }).nextUrl = url
  return req
}

const userSession = { user: { id: 'u1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }

const activeSession = { id: 's1', status: 'active', minGroupSize: 3, maxGroupSize: 3 }
const participantRows = [
  { userId: 'u1', pseudonym: 'Пчела' },
  { userId: 'u2', pseudonym: 'Мальма' },
]

describe('GET /api/matching/state', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when session param missing', async () => {
    mockAuth.mockResolvedValue(userSession)
    const url = new URL('http://localhost/api/matching/state')
    const req = new Request('http://localhost/api/matching/state') as unknown as import('next/server').NextRequest
    ;(req as unknown as { nextUrl: URL }).nextUrl = url
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when session not found', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await GET(makeReq('bad-id'))
    expect(res.status).toBe(404)
  })

  it('returns 200 with state for authenticated user', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([activeSession]) }
    const participantsChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(participantRows) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValue(participantsChain)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('personalBooks')
    expect(json).toHaveProperty('scenarios')
    expect(json).toHaveProperty('scenarioOverview')
    expect(json).toHaveProperty('scenarioSetOverview')
    expect(json).toHaveProperty('myMoves')
    expect(json).toHaveProperty('sessionStatus')
  })

  it('returns 403 when regular user is not a session participant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'outsider', isAdmin: false } })
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([activeSession]) }
    const participantsChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(participantRows) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValue(participantsChain)

    const res = await GET(makeReq('s1'))

    expect(res.status).toBe(403)
  })

  it('replaces participant ids with pseudonyms for regular users', async () => {
    mockAuth.mockResolvedValue(userSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([activeSession]) }
    const participantsChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(participantRows) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValue(participantsChain)

    const res = await GET(makeReq('s1'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.scenarioOverview.leftOut).toEqual([
      { userId: 'Пчела', pseudonym: 'Пчела' },
      { userId: 'Мальма', pseudonym: 'Мальма' },
    ])
    expect(JSON.stringify(json)).not.toContain('"u1"')
    expect(JSON.stringify(json)).not.toContain('"u2"')
  })

  it('keeps internal ids for admins', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const sessionChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([activeSession]) }
    const participantsChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(participantRows) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValue(participantsChain)

    const res = await GET(makeReq('s1', 'u1'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.scenarioOverview.leftOut).toEqual(participantRows)
  })
})

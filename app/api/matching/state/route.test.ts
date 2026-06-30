/**
 * @jest-environment node
 */
import { GET } from './route'
import { auth } from '@/lib/auth'
import {
  fetchMatchingPublicState,
  PublicMatchingStateError,
} from '@/lib/matching/public-state-db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/public-state-db', () => ({
  fetchMatchingPublicState: jest.fn(),
  PublicMatchingStateError: class PublicMatchingStateError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  },
}))

const mockAuth = auth as jest.Mock
const mockFetchState = fetchMatchingPublicState as jest.Mock

function request(query = '?session=s1') {
  return new Request(`http://localhost/api/matching/state${query}`) as unknown as import('next/server').NextRequest
}

describe('GET /api/matching/state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    mockFetchState.mockResolvedValue({ session: { stateVersion: 5 }, scenarios: [] })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await GET(request())).status).toBe(401)
  })

  it('requires a session id', async () => {
    expect((await GET(request(''))).status).toBe(400)
  })

  it('returns the safe public read model for the current participant', async () => {
    mockFetchState.mockResolvedValue({
      session: { name: 'Июль', status: 'active', stateVersion: 5, minGroupSize: 3, maxGroupSize: 5, deadlineAt: null, frozenSnapshot: null },
      viewer: { role: 'active', ref: 'participant-ref', lockedCircleKey: null },
      participants: [{ ref: 'participant-ref', displayName: 'Анна', online: true, confirmedCircleKey: null }],
      scenarios: [{ ref: 'scenario-1', score: { coveredCount: 1, totalCount: 1, avgRank: 1, worstRank: 1 }, leftOut: [], circles: [] }],
      lockedCircles: [], notices: [],
    })
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(mockFetchState).toHaveBeenCalledWith('s1', 'u1')
    const payload = await response.json()
    expect(payload.scenarios[0].score.coveredCount).toBe(1)
    expect(JSON.stringify(payload)).not.toContain('u1')
  })

  it('allows admin impersonation but ignores as for ordinary participants', async () => {
    await GET(request('?session=s1&as=u2'))
    expect(mockFetchState).toHaveBeenLastCalledWith('s1', 'u1')

    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    await GET(request('?session=s1&as=u2'))
    expect(mockFetchState).toHaveBeenLastCalledWith('s1', 'u2')
  })

  it.each([
    ['session_not_found', 404],
    ['participant_missing', 403],
  ] as const)('maps %s to HTTP %s', async (code, status) => {
    mockFetchState.mockRejectedValue(new PublicMatchingStateError(code))
    expect((await GET(request())).status).toBe(status)
  })
})

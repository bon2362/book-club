/**
 * @jest-environment node
 */
import { GET } from './route'
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchFeedForSession } from '@/lib/matching/realtime/feed'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: { id: 'matchingSessions.id' },
  matchingSessionParticipants: {
    sessionId: 'matchingSessionParticipants.sessionId',
    userId: 'matchingSessionParticipants.userId',
  },
}))
jest.mock('@/lib/matching/realtime/feed', () => ({
  fetchFeedForSession: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockFetchFeedForSession = fetchFeedForSession as jest.Mock

function makeReq(sessionId?: string) {
  const suffix = sessionId ? `?session=${sessionId}` : ''
  return new NextRequest(`http://localhost/api/matching/feed${suffix}`)
}

function selectChain(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

describe('GET /api/matching/feed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchFeedForSession.mockResolvedValue([{
      id: 1,
      ts: 1,
      type: 'best',
      actor: { pseudonym: 'Лиса' },
      bookId: 'book-1',
      mutationKind: 'book_added',
      before: null,
      after: { coveredCount: 3, totalCount: 5, strongInterestCount: 2 },
    }])
  })

  it('returns 401 for anonymous users', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(makeReq('session-1'))

    expect(res.status).toBe(401)
  })

  it('requires a session query param', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })

    const res = await GET(makeReq())

    expect(res.status).toBe(400)
  })

  it('returns feed events for admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockDb.select = jest.fn().mockReturnValueOnce(selectChain([{ id: 'session-1' }]))

    const res = await GET(makeReq('session-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.events).toEqual([expect.objectContaining({
      type: 'best',
      actor: { pseudonym: 'Лиса' },
      bookId: 'book-1',
    })])
    expect(JSON.stringify(body.events)).not.toContain('userId')
    expect(mockFetchFeedForSession).toHaveBeenCalledWith('session-1')
  })

  it('returns feed events for session participants', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    mockDb.select = jest.fn()
      .mockReturnValueOnce(selectChain([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectChain([{ userId: 'user-1' }]))

    const res = await GET(makeReq('session-1'))

    expect(res.status).toBe(200)
  })

  it('rejects non-participants', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    mockDb.select = jest.fn()
      .mockReturnValueOnce(selectChain([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectChain([]))

    const res = await GET(makeReq('session-1'))

    expect(res.status).toBe(403)
  })

  it('returns 404 for missing matching sessions', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockDb.select = jest.fn().mockReturnValueOnce(selectChain([]))

    const res = await GET(makeReq('session-1'))

    expect(res.status).toBe(404)
  })
})

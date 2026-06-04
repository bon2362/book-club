/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(query = '') {
  return new NextRequest(`http://localhost/api/admin/matching/preference-events${query}`)
}

function mockSelect(events: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    $dynamic: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(events),
  }
  mockDb.select = jest.fn().mockReturnValue(chain)
  return chain
}

describe('GET /api/admin/matching/preference-events', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 without admin session', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })

    const res = await GET(makeReq())

    expect(res.status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('returns latest events for admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    const occurredAt = new Date('2026-06-01T12:00:00Z')
    mockSelect([
      {
        id: 'event-1',
        sessionId: 'session-1',
        userId: 'user-1',
        actorUserId: 'admin-1',
        userName: 'Иван',
        actorName: 'Админ',
        userPseudonym: 'Белка',
        actorPseudonym: null,
        eventType: 'priority_reordered',
        source: 'matching_feed',
        bookId: 'book-1',
        before: { rank: 3 },
        after: { rank: 1 },
        metadata: null,
        occurredAt,
      },
    ])

    const res = await GET(makeReq())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.events).toHaveLength(1)
    expect(data.events[0].id).toBe('event-1')
    expect(data.events[0]).toMatchObject({
      userName: 'Иван',
      actorName: 'Админ',
      userPseudonym: 'Белка',
      actorPseudonym: null,
    })
  })

  it('applies supported filters and caps limit', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    const chain = mockSelect([])

    const res = await GET(makeReq('?sessionId=s1&userId=u1&actorUserId=a1&eventType=rank&source=matching&bookId=b1&limit=9999'))

    expect(res.status).toBe(200)
    expect(chain.where).toHaveBeenCalledTimes(1)
    expect(chain.limit).toHaveBeenCalledWith(500)
  })

  it('uses default limit for invalid limit values', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    const chain = mockSelect([])

    await GET(makeReq('?limit=nope'))

    expect(chain.limit).toHaveBeenCalledWith(100)
  })
})

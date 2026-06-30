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
const mockDb = db as unknown as { select: jest.Mock }
const params = { params: { id: 'session-1' } }
const request = new NextRequest('http://localhost/api/admin/matching/sessions/session-1/locked-circles')

function circlesSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  }
  return chain
}

function membersSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  }
  return chain
}

describe('GET /api/admin/matching/sessions/[id]/locked-circles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
  })

  it('returns 403 without an admin session', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })

    const response = await GET(request, params)

    expect(response.status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('returns an empty registry without querying members', async () => {
    mockDb.select.mockReturnValueOnce(circlesSelect([]))

    const response = await GET(request, params)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [] })
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('returns locked and dissolved circles with book titles and member snapshots', async () => {
    const lockedAt = new Date('2026-06-30T10:00:00.000Z')
    const dissolvedAt = new Date('2026-06-30T11:00:00.000Z')
    mockDb.select
      .mockReturnValueOnce(circlesSelect([
        {
          id: 'circle-2',
          sessionId: 'session-1',
          circleKey: 'key-2',
          bookId: 'book-2',
          bookTitle: 'Распущенная книга',
          status: 'dissolved',
          lockedAt,
          dissolvedAt,
          dissolveReason: 'Состав изменился',
        },
        {
          id: 'circle-1',
          sessionId: 'session-1',
          circleKey: 'key-1',
          bookId: 'book-1',
          bookTitle: 'Закреплённая книга',
          status: 'locked',
          lockedAt,
          dissolvedAt: null,
          dissolveReason: null,
        },
      ]))
      .mockReturnValueOnce(membersSelect([
        { circleId: 'circle-1', userId: 'user-1', displayNameSnapshot: 'Анна', releasedAt: null },
        { circleId: 'circle-1', userId: 'user-2', displayNameSnapshot: 'Борис', releasedAt: null },
        { circleId: 'circle-2', userId: 'user-3', displayNameSnapshot: 'Вера', releasedAt: dissolvedAt },
      ]))

    const response = await GET(request, params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 'circle-2',
        bookTitle: 'Распущенная книга',
        status: 'dissolved',
        dissolveReason: 'Состав изменился',
        members: [{
          userId: 'user-3',
          displayNameSnapshot: 'Вера',
          releasedAt: dissolvedAt.toISOString(),
        }],
      }),
      expect.objectContaining({
        id: 'circle-1',
        bookTitle: 'Закреплённая книга',
        status: 'locked',
        members: [
          { userId: 'user-1', displayNameSnapshot: 'Анна', releasedAt: null },
          { userId: 'user-2', displayNameSnapshot: 'Борис', releasedAt: null },
        ],
      }),
    ])
  })
})

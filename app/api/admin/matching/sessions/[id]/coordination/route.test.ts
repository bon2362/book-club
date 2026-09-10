/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import {
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingSessionParticipants,
  matchingSessions,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
// Условия запросов записываем как есть, чтобы проверить фильтр по id сессии без реальной БД.
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((column: unknown, value: unknown) => ({ op: 'eq', column, value })),
  and: jest.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  inArray: jest.fn((column: unknown, values: unknown) => ({ op: 'inArray', column, values })),
  isNull: jest.fn((column: unknown) => ({ op: 'isNull', column })),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as unknown as { select: jest.Mock }
const mockEq = eq as unknown as jest.Mock

const params = { params: { id: 'session-1' } }

/** Любая цепочка Drizzle: все методы возвращают её же, `await` отдаёт строки. */
function rows(result: unknown[]) {
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'leftJoin', 'innerJoin', 'where', 'limit', 'orderBy']) chain[method] = () => chain
  chain.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return chain
}

const SESSION_ROW = { id: 'session-1', name: 'Сентябрь', status: 'open', deadlineAt: new Date('2026-09-20T18:42:00Z') }

function queue(...results: unknown[][]) {
  for (const result of results) mockDb.select.mockReturnValueOnce(rows(result))
}

function request() {
  return GET(new NextRequest('http://localhost/api/admin/matching/sessions/session-1/coordination'), params)
}

describe('GET /api/admin/matching/sessions/[id]/coordination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
  })

  it('403 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await request()).status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('403 for a signed-in non-admin: aggregated lists stay private', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await request()).status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('404 for an unknown session', async () => {
    queue([])
    expect((await request()).status).toBe(404)
  })

  it('returns the radar for the selected session with active participants only', async () => {
    queue(
      [SESSION_ROW],
      [
        { userId: 'u1', completedAt: null, name: 'Анна' },
        { userId: 'u2', completedAt: null, name: 'Борис' },
        { userId: 'u3', completedAt: null, name: 'Вера' },
        { userId: 'done', completedAt: new Date('2026-09-09T19:00:00Z'), name: 'Готово' },
      ],
      [
        { userId: 'u1', bookId: 'b1', title: 'Моби Дик', author: 'Мелвилл', rank: 1 },
        { userId: 'u2', bookId: 'b1', title: 'Моби Дик', author: 'Мелвилл', rank: 2 },
        { userId: 'u3', bookId: 'b1', title: 'Моби Дик', author: 'Мелвилл', rank: null },
        { userId: 'done', bookId: 'b2', title: 'Икс', author: '', rank: 1 },
      ],
      [{ userId: 'u3', bookId: 'b9', title: 'Уроки химии' }],
      [{ userId: 'u2', bookId: 'b1', kind: 'hard' }],
      [{ userId: 'u1', bookId: 'b1', circleId: 'c-1' }],
      [{ id: 'c-1', bookId: 'b1' }, { id: 'c-2', bookId: 'b1' }],
    )

    const res = await request()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.session).toEqual({ id: 'session-1', title: 'Сентябрь', status: 'open', deadlineAt: '2026-09-20T18:42:00.000Z' })
    expect(body.summary).toEqual({
      activeParticipants: 3,
      signedUpParticipants: 1,
      assignedParticipants: 1,
      readingParticipants: 1,
      demandedBooks: 1,
      formedCircles: 2,
    })
    expect(body.books).toHaveLength(1)
    expect(body.books[0]).toMatchObject({
      bookId: 'b1',
      title: 'Моби Дик',
      interestedCount: 3,
      formedCircleCount: 2,
      participants: [
        { userId: 'u1', name: 'Анна', rank: 1, status: 'assigned', assignedCircleId: 'c-1', readingNow: [] },
        { userId: 'u2', name: 'Борис', rank: 2, status: 'signed_up', assignedCircleId: null, readingNow: [] },
        { userId: 'u3', name: 'Вера', rank: null, status: 'wishlist', assignedCircleId: null, readingNow: [{ bookId: 'b9', title: 'Уроки химии' }] },
      ],
    })

    // Сессионные таблицы читаются строго по id выбранной сессии.
    for (const column of [
      matchingSessions.id,
      matchingSessionParticipants.sessionId,
      matchingBookIntents.sessionId,
      matchingBookAssignments.sessionId,
      matchingCircles.sessionId,
    ]) {
      expect(mockEq).toHaveBeenCalledWith(column, 'session-1')
    }
  })

  it('returns an empty book list when nobody overlaps', async () => {
    queue([SESSION_ROW], [], [], [], [], [], [])

    const res = await request()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.books).toEqual([])
    expect(body.summary).toMatchObject({ activeParticipants: 0, demandedBooks: 0, formedCircles: 0 })
  })
})

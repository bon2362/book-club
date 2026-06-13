/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PUT } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import * as activityModule from '@/lib/user-activity'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { finalizeMatchingMutationEffects } from '@/lib/matching/mutation-effects'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}))
jest.mock('@/lib/user-activity', () => ({
  buildUserActivityDedupeKey: jest.fn(() => 'priorities-dedupe-key'),
  bestEffortRecordUserActivity: jest.fn(),
}))
jest.mock('@/lib/matching/realtime/state-change', () => ({
  broadcastActiveMatchingStateChangeForParticipant: jest.fn(),
  getActiveMatchingSessionIdForParticipant: jest.fn(),
}))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn(),
  finalizeMatchingMutationEffects: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockRecordUserActivity = activityModule.bestEffortRecordUserActivity as jest.Mock
const mockBroadcastMatchingStateChange = broadcastActiveMatchingStateChangeForParticipant as jest.Mock
const mockGetActiveSessionId = getActiveMatchingSessionIdForParticipant as jest.Mock
const mockFinalizeEffects = finalizeMatchingMutationEffects as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGetActiveSessionId.mockResolvedValue(null)
  ;(db.transaction as jest.Mock).mockImplementation(async (callback) => callback(db))
})

function makeSelectMock(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  }
  return chain
}

function makePut(body: object) {
  return new NextRequest('http://localhost/api/priorities', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('возвращает [] если нет приоритетов', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([]))

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual([])
  })

  it('возвращает приоритеты отсортированные по rank', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const rows = [
      { bookId: 'book-a', bookName: 'Книга А', rank: 1 },
      { bookId: 'book-b', bookName: 'Книга Б', rank: 2 },
    ]
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock(rows))

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(rows)
  })
})

describe('PUT /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePut({ bookIds: ['book-a'] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 400 если books не массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ bookIds: 'book-a' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если books пустой массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ bookIds: [] }))
    expect(res.status).toBe(400)
  })

  it('сохраняет приоритеты и устанавливает prioritiesSet=true', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { id: 'book-a', title: 'Книга А' },
          { id: 'book-b', title: 'Книга Б' },
        ]),
      }),
    })

    const mockInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    }
    const mockDelete = {
      where: jest.fn().mockResolvedValue(undefined),
    }
    const mockUpdate = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }
    ;(db.insert as jest.Mock).mockReturnValue(mockInsert)
    ;(db.delete as jest.Mock).mockReturnValue(mockDelete)
    ;(db.update as jest.Mock).mockReturnValue(mockUpdate)

    const res = await PUT(makePut({ bookIds: ['book-a', 'book-b'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(db.insert).toHaveBeenCalled()
    expect(mockInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({ bookId: 'book-a', rank: 1 }),
      expect.objectContaining({ bookId: 'book-b', rank: 2 }),
    ])
    expect(db.update).toHaveBeenCalled()
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'priorities_updated', expect.objectContaining({
      source: 'api',
      metadata: { booksCount: 2 },
    }))
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('user-1')
  })

  it('при активной сессии пишет событие предпочтений с упорядоченным списком книг', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetActiveSessionId.mockResolvedValue('session-1')
    ;(db.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: 'book-a' }, { id: 'book-b' }]),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([]),
          }),
        }),
      })
    ;(db.insert as jest.Mock).mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) })
    ;(db.delete as jest.Mock).mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    ;(db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    })

    const res = await PUT(makePut({ bookIds: ['book-b', 'book-a'] }))

    expect(res.status).toBe(200)
    expect(mockFinalizeEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        kind: 'priorities_updated',
        source: 'profile',
        metadata: { rankedBookIds: ['book-b', 'book-a'], previousRankedBookIds: [] },
      }),
    )
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signup-books'
import { db } from '@/lib/db'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-books', () => ({ removeBookFromSignup: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}))
jest.mock('@/lib/matching/realtime/state-change', () => ({
  broadcastActiveMatchingStateChangeForParticipant: jest.fn(),
  getActiveMatchingSessionIdForParticipant: jest.fn(),
}))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn((jest.requireMock('@/lib/db') as { db: unknown }).db),
}))

const mockAuth = authModule.auth as jest.Mock
const mockRemoveBook = signups.removeBookFromSignup as jest.Mock
const mockBroadcastMatchingStateChange = broadcastActiveMatchingStateChangeForParticipant as jest.Mock
const mockGetActiveSessionId = getActiveMatchingSessionIdForParticipant as jest.Mock
const mockRunMatchingTransition = runMatchingTransition as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/remove-book', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetActiveSessionId.mockResolvedValue(null)
  ;(db.transaction as jest.Mock).mockImplementation(async (callback) => callback(db))
  // Default: no priority row found → priority step is skipped
  const defaultChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  }
  ;(db.select as jest.Mock).mockReturnValue(defaultChain)
  ;(db.delete as jest.Mock).mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
  ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) })
})

describe('DELETE /api/admin/remove-book — security', () => {
  it('[SEC] возвращает 403 при isAdmin=undefined', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] возвращает 403 при isAdmin=null', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: null } })
    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] не-админ не может удалить книгу другого пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
    const res = await DELETE(makeRequest({ userId: 'victim@test.com', bookId: 'book-a' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] NEXTAUTH_TEST_MODE не обходит проверку isAdmin', async () => {
    const original = process.env.NEXTAUTH_TEST_MODE
    process.env.NEXTAUTH_TEST_MODE = 'true'
    try {
      mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
      const res = await DELETE(makeRequest({ userId: 'victim@test.com', bookId: 'book-a' }))
      expect(res.status).toBe(403)
    } finally {
      process.env.NEXTAUTH_TEST_MODE = original
    }
  })
})

describe('DELETE /api/admin/remove-book', () => {
  it('runs an active participant removal inside the matching transaction', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Админ', isAdmin: true } })
    mockGetActiveSessionId.mockResolvedValue('session-1')

    const res = await DELETE(makeRequest({ userId: 'u1', bookId: 'book-a' }))

    expect(res.status).toBe(200)
    expect(mockRunMatchingTransition).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      actor: expect.objectContaining({ userId: 'admin-1', source: 'admin' }),
      action: { type: 'change_book', userId: 'u1', bookId: 'book-a', operation: 'remove' },
    }))
    expect(mockRemoveBook).not.toHaveBeenCalled()
  })

  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })

    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии userId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ bookId: 'book-a' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии bookId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и вызывает removeBookFromSignup', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.removeBookFromSignup).toHaveBeenCalledWith('pg-user-1', 'book-a', db)
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('pg-user-1')
  })
})

describe('DELETE /api/admin/remove-book — priority re-rank', () => {
  it('удаляет приоритет и сдвигает ранги при удалении книги', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const selectPriorityChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ rank: 2 }]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(selectPriorityChain)

    const mockDeleteWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where: mockDeleteWhere })

    const mockUpdateWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: mockUpdateWhere })

    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-b' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)

    // delete priority row
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)

    // re-rank: UPDATE rank = rank - 1 WHERE rank > 2
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1)
  })

  it('пропускает re-rank если нет записи приоритета для книги', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const selectNoPriorityChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(selectNoPriorityChain)

    const res = await DELETE(makeRequest({ userId: 'pg-user-1', bookId: 'book-a' }))
    expect(res.status).toBe(200)
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})

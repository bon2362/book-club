/**
 * @jest-environment node
 */
import { PATCH } from './route'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

import { auth } from '@/lib/auth'
const mockAuth = auth as jest.Mock
const mockBroadcastMatchingStateChange = broadcastActiveMatchingStateChangeForParticipant as jest.Mock
const mockGetActiveSessionId = getActiveMatchingSessionIdForParticipant as jest.Mock
const mockRunMatchingTransition = runMatchingTransition as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/signup-books', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetActiveSessionId.mockResolvedValue(null)
  ;(db.transaction as jest.Mock).mockImplementation(async (callback) => callback(db))
  // Default: signup row NOT found → 404
  const defaultChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  }
  ;(db.select as jest.Mock).mockReturnValue(defaultChain)
  ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) })
  ;(db.delete as jest.Mock).mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
})

describe('PATCH /api/admin/signup-books — security & validation', () => {
  it('returns 403 when not admin', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', isAdmin: false } })
    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'reading' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 without session', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'reading' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing userId', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await PATCH(makeRequest({ bookId: 'b1', status: 'reading' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing bookId', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await PATCH(makeRequest({ userId: 'u1', status: 'reading' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin', isAdmin: true } })
    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when user is not signed up for the book', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    // db.select returns [] by default (set in beforeEach)
    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'reading' }))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/signup-books — happy path', () => {
  it('runs an active participant status change inside the matching transaction', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin-1', name: 'Админ', isAdmin: true } })
    mockGetActiveSessionId.mockResolvedValue('session-1')
    const signupChain = {
      from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'b1' }]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(signupChain)

    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'read' }))

    expect(res.status).toBe(200)
    expect(mockRunMatchingTransition).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      actor: expect.objectContaining({ userId: 'admin-1', source: 'admin' }),
      action: { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'read' },
    }))
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns 200 when status = reading and user is signed up (no priority row)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })

    // First select: signup row found
    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'b1' }]),
    }
    // Second select: no priority row
    const noPriorityChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(signupChain)
      .mockReturnValueOnce(noPriorityChain)

    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'reading' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('u1')
  })

  it('returns 200 and rerranks when status = read and user has priority row', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })

    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'b1' }]),
    }
    const priorityChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ rank: 2 }]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(signupChain)
      .mockReturnValueOnce(priorityChain)

    const mockDeleteWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where: mockDeleteWhere })

    const mockUpdateWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: mockUpdateWhere })

    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: 'read' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    // update signupBooks + update bookPriorities (re-rank)
    expect(db.update).toHaveBeenCalledTimes(2)
    // delete priority row
    expect(db.delete).toHaveBeenCalledTimes(1)
  })

  it('returns 200 when status = null (reset) — no priority rerank', async () => {
    mockAuth.mockResolvedValueOnce({ user: { isAdmin: true } })

    const signupChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ bookId: 'b1' }]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(signupChain)

    const res = await PATCH(makeRequest({ userId: 'u1', bookId: 'b1', status: null }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    // Only updates signupBooks, no priority operations
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    // No second select for priorities (status is null)
    expect(db.select).toHaveBeenCalledTimes(1)
  })
})

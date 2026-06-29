/**
 * @jest-environment node
 */
import { DELETE } from './route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockDb = db as unknown as { select: jest.Mock }
const mockRunTransition = runMatchingTransition as jest.Mock

function activeSessionSelect(rows: unknown[] = [{ id: 'session-1' }]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain
}

function makeReq(asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/books/b1${suffix}`, {
    method: 'DELETE',
  }) as unknown as import('next/server').NextRequest
}

describe('DELETE /api/matching/books/[bookId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна', contactEmail: null, isAdmin: false } })
    mockDb.select.mockReturnValue(activeSessionSelect())
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await DELETE(makeReq(), { params: { bookId: 'b1' } })).status).toBe(401)
  })

  it('removes a book for the viewer through the transition service', async () => {
    const res = await DELETE(makeReq(), { params: { bookId: 'b1' } })
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'u1', label: 'Анна', source: 'matching' },
      action: { type: 'change_book', userId: 'u1', bookId: 'b1', operation: 'remove' },
    })
  })

  it('lets an admin remove a book for an impersonated participant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin1', name: 'Админ', contactEmail: null, isAdmin: true } })
    const res = await DELETE(makeReq('participant1'), { params: { bookId: 'b1' } })
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin1', label: 'Админ', source: 'admin' },
      action: { type: 'change_book', userId: 'participant1', bookId: 'b1', operation: 'remove' },
    })
  })

  it('maps a frozen session to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_frozen'))
    expect((await DELETE(makeReq(), { params: { bookId: 'b1' } })).status).toBe(409)
  })
})

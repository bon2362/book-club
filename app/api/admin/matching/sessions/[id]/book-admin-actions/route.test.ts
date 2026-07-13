/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { fetchMatchingPublicState } from '@/lib/matching/public-state-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/matching/public-state-db', () => ({ fetchMatchingPublicState: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockTransition = runMatchingTransition as jest.Mock
const mockState = fetchMatchingPublicState as jest.Mock
const params = { params: { id: 'session-1' } }

function request(body: unknown) {
  return new Request('http://localhost/api/admin/matching/sessions/session-1/book-admin-actions', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

describe('POST book-admin-actions', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin', isAdmin: true } })
    mockTransition.mockResolvedValue({ changed: true, stateVersion: 4 })
    mockState.mockResolvedValue({ bookMode: { books: [] } })
  })

  it('maps an atomic cross-book assignment', async () => {
    const response = await POST(request({ action: 'assign', userId: 'user-1', bookId: 'book-2', expectedStateVersion: 3 }), params)
    expect(response.status).toBe(200)
    expect(mockTransition).toHaveBeenCalledWith(expect.objectContaining({
      action: { type: 'admin_assign_book', userId: 'user-1', bookId: 'book-2' },
    }))
  })

  it('keeps lifecycle commands behind admin auth', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    expect((await POST(request({ action: 'closeSession', expectedStateVersion: 3 }), params)).status).toBe(403)
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('returns a domain 409 when another session is already open during reopen', async () => {
    mockTransition.mockRejectedValue(new MatchingTransitionError('book_action_forbidden'))
    const response = await POST(request({ action: 'reopenSession', expectedStateVersion: 3 }), params)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'book_action_forbidden' })
  })
})

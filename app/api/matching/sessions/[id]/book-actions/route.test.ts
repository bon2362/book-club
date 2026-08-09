/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { fetchMatchingPublicState, PublicMatchingStateError } from '@/lib/matching/public-state-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/matching/public-state-db', () => {
  class MockPublicMatchingStateError extends Error {
    constructor(public readonly code: 'session_not_found' | 'participant_missing') {
      super(code)
      this.name = 'PublicMatchingStateError'
    }
  }
  return {
    fetchMatchingPublicState: jest.fn(),
    PublicMatchingStateError: MockPublicMatchingStateError,
  }
})

const mockAuth = auth as jest.Mock
const mockTransition = runMatchingTransition as jest.Mock
const mockState = fetchMatchingPublicState as jest.Mock
const params = { params: { id: 'session-1' } }

function request(body: unknown, query = '') {
  return new Request(`http://localhost/api/matching/sessions/session-1/book-actions${query}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

describe('POST book-actions', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Анна' } })
    mockTransition.mockResolvedValue({ changed: true, stateVersion: 3 })
    mockState.mockResolvedValue({ session: { stateVersion: 3 }, bookMode: { books: [] } })
  })

  it('maps a participant command without accepting a user id from the client', async () => {
    const response = await POST(request({ action: 'setHard', bookId: 'book-1', expectedStateVersion: 2 }), params)
    expect(response.status).toBe(200)
    expect(mockTransition).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', expectedStateVersion: 2,
      action: { type: 'set_hard', userId: 'user-1', bookId: 'book-1' },
    }))
  })

  it('maps hard cancellation to a specific book and rejects a missing book', async () => {
    const response = await POST(request({ action: 'cancelHard', bookId: 'book-1', expectedStateVersion: 2 }), params)
    expect(response.status).toBe(200)
    expect(mockTransition).toHaveBeenCalledWith(expect.objectContaining({
      action: { type: 'cancel_hard', userId: 'user-1', bookId: 'book-1' },
    }))

    mockTransition.mockClear()
    expect((await POST(request({ action: 'cancelHard', expectedStateVersion: 2 }), params)).status).toBe(400)
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('lets an admin act for an impersonated participant while preserving the admin actor', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Организатор', isAdmin: true } })
    const response = await POST(
      request({ action: 'setHard', bookId: 'book-2', expectedStateVersion: 2 }, '?as=user-2'),
      params,
    )

    expect(response.status).toBe(200)
    expect(mockTransition).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: 'admin-1', label: 'Организатор', source: 'admin' },
      action: { type: 'set_hard', userId: 'user-2', bookId: 'book-2' },
    }))
    expect(mockState).toHaveBeenCalledWith('session-1', 'user-2')
  })

  it('rejects impersonation by an ordinary participant', async () => {
    const response = await POST(
      request({ action: 'setHard', bookId: 'book-2', expectedStateVersion: 2 }, '?as=user-2'),
      params,
    )

    expect(response.status).toBe(403)
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('rejects even an empty impersonation parameter for an ordinary participant', async () => {
    const response = await POST(
      request({ action: 'cancelHard', expectedStateVersion: 2 }, '?as='),
      params,
    )

    expect(response.status).toBe(403)
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('rejects an empty impersonation target for an admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Организатор', isAdmin: true } })
    const response = await POST(
      request({ action: 'cancelHard', expectedStateVersion: 2 }, '?as=%20%20'),
      params,
    )

    expect(response.status).toBe(400)
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('returns canonical state with a stale conflict', async () => {
    mockTransition.mockRejectedValue(new MatchingTransitionError('stale_state'))
    const response = await POST(request({ action: 'cancelHard', bookId: 'book-1', expectedStateVersion: 1 }), params)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'stale_state', state: expect.any(Object) }))
  })

  it('returns impersonated canonical state with a stale conflict', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Организатор', isAdmin: true } })
    mockTransition.mockRejectedValue(new MatchingTransitionError('stale_state'))
    const response = await POST(
      request({ action: 'cancelHard', bookId: 'book-1', expectedStateVersion: 1 }, '?as=user-2'),
      params,
    )

    expect(response.status).toBe(409)
    expect(mockState).toHaveBeenCalledWith('session-1', 'user-2')
  })

  it('maps a missing impersonated participant during stale recovery instead of throwing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Организатор', isAdmin: true } })
    mockTransition.mockRejectedValue(new MatchingTransitionError('stale_state'))
    mockState.mockRejectedValue(new PublicMatchingStateError('participant_missing'))

    const response = await POST(
      request({ action: 'cancelHard', bookId: 'book-1', expectedStateVersion: 1 }, '?as=user-2'),
      params,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'participant_missing' })
  })

  it('requires authentication', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(request({}), params)).status).toBe(401)
  })
})

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
  return new Request('http://localhost/api/matching/sessions/session-1/book-actions', {
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

  it('returns canonical state with a stale conflict', async () => {
    mockTransition.mockRejectedValue(new MatchingTransitionError('stale_state'))
    const response = await POST(request({ action: 'cancelHard', expectedStateVersion: 1 }), params)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'stale_state', state: expect.any(Object) }))
  })

  it('requires authentication', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(request({}), params)).status).toBe(401)
  })
})

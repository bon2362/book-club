/**
 * @jest-environment node
 */
import { DELETE, PUT } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({
  runMatchingTransition: jest.fn(),
}))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

function request(method: 'PUT' | 'DELETE', body: unknown) {
  return new Request('http://localhost/api/matching/sessions/s1/confirmation', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const viewerSession = {
  user: { id: 'u1', name: 'Анна', contactEmail: null, isAdmin: false },
}

describe('/api/matching/sessions/[id]/confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(viewerSession)
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 5 })
  })

  it('returns 401 without an authenticated user', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await PUT(request('PUT', {}), { params: { id: 's1' } })).status).toBe(401)
  })

  it('validates circleKey and expectedStateVersion', async () => {
    expect((await PUT(request('PUT', {
      circleKey: '',
      expectedStateVersion: -1,
    }), { params: { id: 's1' } })).status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('creates or switches the only confirmation through the transaction service', async () => {
    const response = await PUT(request('PUT', {
      circleKey: 'circle-a',
      expectedStateVersion: 4,
    }), { params: { id: 's1' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ changed: true, stateVersion: 5 })
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 's1',
      actor: { userId: 'u1', label: 'Анна', source: 'matching' },
      expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    })
  })

  it('cancels the confirmation through the same transaction service', async () => {
    const response = await DELETE(request('DELETE', {
      expectedStateVersion: 4,
    }), { params: { id: 's1' } })

    expect(response.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith(expect.objectContaining({
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }))
  })

  it.each([
    ['stale_state', 409],
    ['session_frozen', 409],
    ['participant_locked', 409],
    ['circle_not_found', 404],
    ['session_not_found', 404],
  ] as const)('maps %s to HTTP %s', async (code, status) => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError(code))

    const response = await PUT(request('PUT', {
      circleKey: 'circle-a',
      expectedStateVersion: 4,
    }), { params: { id: 's1' } })

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
  })
})

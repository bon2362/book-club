/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

function request(body: unknown) {
  return new Request('http://localhost/api/matching/sessions/s1/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const viewerSession = {
  user: { id: 'u1', name: 'Старое имя', contactEmail: null, isAdmin: false },
}

describe('POST /api/matching/sessions/[id]/join', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(viewerSession)
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 1 })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(request({ name: 'Анна' }), { params: { id: 's1' } })).status).toBe(401)
  })

  it('requires a non-empty global profile name', async () => {
    const response = await POST(request({ name: '   ' }), { params: { id: 's1' } })
    expect(response.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('updates the global name and joins atomically through the transition service', async () => {
    const response = await POST(request({ name: '  Анна  ' }), { params: { id: 's1' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ changed: true, stateVersion: 1 })
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 's1',
      actor: { userId: 'u1', label: 'Анна', source: 'matching' },
      action: { type: 'self_join', userId: 'u1', name: 'Анна' },
    })
  })

  it('maps an unknown session to 404', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_not_found'))
    const response = await POST(request({ name: 'Анна' }), { params: { id: 'missing' } })
    expect(response.status).toBe(404)
  })
})

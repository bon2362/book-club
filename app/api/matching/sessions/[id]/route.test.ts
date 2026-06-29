/**
 * @jest-environment node
 */
import { PATCH } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

function makeReq(body: object) {
  return new Request('http://localhost/api/matching/sessions/session-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const params = { params: { id: 'session-1' } }

describe('PATCH /api/matching/sessions/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    expect((await PATCH(makeReq({ minGroupSize: 3, maxGroupSize: 4 }), params)).status).toBe(403)
  })

  it('rejects invalid group size ranges', async () => {
    expect((await PATCH(makeReq({ minGroupSize: 1, maxGroupSize: 4 }), params)).status).toBe(400)
    expect((await PATCH(makeReq({ minGroupSize: 4, maxGroupSize: 3 }), params)).status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('updates group size through the transition service', async () => {
    const res = await PATCH(makeReq({ minGroupSize: 3, maxGroupSize: 4 }), params)
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin1', label: 'Админ', source: 'admin' },
      action: { type: 'change_group_size', min: 3, max: 4 },
    })
  })

  it('maps an unknown session to 404', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_not_found'))
    expect((await PATCH(makeReq({ minGroupSize: 3, maxGroupSize: 4 }), params)).status).toBe(404)
  })
})

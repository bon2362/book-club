/**
 * @jest-environment node
 */
import { DELETE } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

function request(body: unknown) {
  return new Request('http://localhost/api/matching/sessions/s1/leave', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('DELETE /api/matching/sessions/[id]/leave', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна', isAdmin: false } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 6 })
  })

  it('requires authentication and expected version', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await DELETE(request({}), { params: { id: 's1' } })).status).toBe(401)

    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна' } })
    expect((await DELETE(request({}), { params: { id: 's1' } })).status).toBe(400)
  })

  it('removes an active participant through the transition service', async () => {
    const response = await DELETE(request({ expectedStateVersion: 5 }), { params: { id: 's1' } })

    expect(response.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith(expect.objectContaining({
      expectedStateVersion: 5,
      action: { type: 'leave', userId: 'u1' },
    }))
  })

  it('rejects leaving after the participant was locked', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('participant_locked'))
    expect((await DELETE(request({ expectedStateVersion: 5 }), { params: { id: 's1' } })).status).toBe(409)
  })
})

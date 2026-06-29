/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

function makeReq() {
  return new Request('http://localhost/api/matching/sessions/session-1/freeze', {
    method: 'POST',
  }) as unknown as import('next/server').NextRequest
}

const params = { params: { id: 'session-1' } }

describe('POST /api/matching/sessions/[id]/freeze', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 5 })
  })

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    expect((await POST(makeReq(), params)).status).toBe(403)
  })

  it('freezes the session through the transition service', async () => {
    const res = await POST(makeReq(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, changed: true, stateVersion: 5 })
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin1', label: 'Админ', source: 'admin' },
      action: { type: 'freeze' },
    })
  })

  it('maps an already-frozen session to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_frozen'))
    expect((await POST(makeReq(), params)).status).toBe(409)
  })
})

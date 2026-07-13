/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'
import { getActiveMatchingSessionIdForParticipant } from '@/lib/matching/realtime/state-change'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/matching/realtime/state-change', () => ({ getActiveMatchingSessionIdForParticipant: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock
const mockCurrentSession = getActiveMatchingSessionIdForParticipant as jest.Mock

function makeReq(body: object, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/books${suffix}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/matching/books', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна', contactEmail: null, isAdmin: false } })
    mockCurrentSession.mockResolvedValue('session-1')
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(makeReq({ bookId: 'b1' }))).status).toBe(401)
  })

  it('rejects a non-admin impersonation attempt', async () => {
    const res = await POST(makeReq({ bookId: 'b1' }, 'someone'))
    expect(res.status).toBe(403)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('returns 404 when no active session exists', async () => {
    mockCurrentSession.mockResolvedValue(null)
    expect((await POST(makeReq({ bookId: 'b1' }))).status).toBe(404)
  })

  it('requires a bookId', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('adds a book for the viewer through the transition service', async () => {
    const res = await POST(makeReq({ bookId: '  b1  ' }))
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'u1', label: 'Анна', source: 'matching' },
      action: { type: 'change_book', userId: 'u1', bookId: 'b1', operation: 'add' },
    })
  })

  it('lets an admin add a book for an impersonated participant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin1', name: 'Админ', contactEmail: null, isAdmin: true } })
    const res = await POST(makeReq({ bookId: 'b1' }, 'participant1'))
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin1', label: 'Админ', source: 'admin' },
      action: { type: 'change_book', userId: 'participant1', bookId: 'b1', operation: 'add' },
    })
  })

  it('maps an observer/locked participant to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('participant_locked'))
    expect((await POST(makeReq({ bookId: 'b1' }))).status).toBe(409)
  })
})

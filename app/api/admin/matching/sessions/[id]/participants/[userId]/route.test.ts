/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

const params = { params: { id: 'session-1', userId: 'user-1' } }

function makeReq() {
  return new NextRequest('http://localhost/api/admin/matching/sessions/session-1/participants/user-1', {
    method: 'DELETE',
  })
}

describe('DELETE /api/admin/matching/sessions/[id]/participants/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 3 })
  })

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    const res = await DELETE(makeReq(), params)
    expect(res.status).toBe(403)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('removes the participant through the transition service with admin actor', async () => {
    const res = await DELETE(makeReq(), params)
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin-1', label: 'Админ', source: 'admin' },
      action: { type: 'admin_remove', userId: 'user-1' },
    })
  })

  it('refuses to remove a locked member (409)', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('participant_locked'))
    const res = await DELETE(makeReq(), params)
    expect(res.status).toBe(409)
  })

  it('maps a frozen session to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_frozen'))
    expect((await DELETE(makeReq(), params)).status).toBe(409)
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockRunTransition = runMatchingTransition as jest.Mock

const params = { params: { id: 'session-1', circleId: 'circle-1' } }

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/admin/matching/sessions/session-1/circles/circle-1/dissolve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/admin/matching/sessions/[id]/circles/[circleId]/dissolve', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 7 })
  })

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await POST(makeReq({ reason: 'нужно' }), params)).status).toBe(403)
  })

  it('requires a non-empty reason', async () => {
    const res = await POST(makeReq({ reason: '   ' }), params)
    expect(res.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('dissolves the circle through the transition service', async () => {
    const res = await POST(makeReq({ reason: '  состав не сошёлся  ' }), params)
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin-1', label: 'Админ', source: 'admin' },
      action: { type: 'dissolve_circle', circleId: 'circle-1', reason: 'состав не сошёлся' },
    })
  })

  it('maps an unknown circle to 404', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('circle_not_found'))
    expect((await POST(makeReq({ reason: 'нужно' }), params)).status).toBe(404)
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'
import { fetchOnlinePseudonyms } from '@/lib/matching/presence'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/matching/presence', () => ({ fetchOnlinePseudonyms: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as unknown as { select: jest.Mock }
const mockRunTransition = runMatchingTransition as jest.Mock
const mockOnline = fetchOnlinePseudonyms as jest.Mock

const params = { params: { id: 'session-1' } }

function participantsSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  }
  return chain
}

function lockedSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  }
  return chain
}

describe('GET /api/admin/matching/sessions/[id]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockOnline.mockResolvedValue(['user-1'])
  })

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await GET(new NextRequest('http://localhost/x'), params)).status).toBe(403)
  })

  it('marks locked members as observers and returns real names', async () => {
    mockDb.select
      .mockReturnValueOnce(participantsSelect([
        { userId: 'user-1', publicRef: 'ref-1', joinSource: 'self', joinedAt: new Date(), name: 'Анна' },
        { userId: 'user-2', publicRef: 'ref-2', joinSource: 'admin', joinedAt: new Date(), name: 'Борис' },
      ]))
      .mockReturnValueOnce(lockedSelect([{ userId: 'user-2' }]))

    const res = await GET(new NextRequest('http://localhost/x'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      expect.objectContaining({ userId: 'user-1', name: 'Анна', joinSource: 'self', role: 'active' }),
      expect.objectContaining({ userId: 'user-2', name: 'Борис', joinSource: 'admin', role: 'observer' }),
    ])
    expect(body.online).toEqual(['user-1'])
  })
})

describe('POST /api/admin/matching/sessions/[id]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/admin/matching/sessions/session-1/participants', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  }

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await POST(makeReq({ userId: 'user-1' }), params)).status).toBe(403)
  })

  it('requires a userId', async () => {
    const res = await POST(makeReq({}), params)
    expect(res.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('adds the participant through the transition service with admin source', async () => {
    const res = await POST(makeReq({ userId: 'user-1' }), params)
    expect(res.status).toBe(201)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin-1', label: 'Админ', source: 'admin' },
      action: { type: 'admin_add', userId: 'user-1' },
    })
  })

  it('maps a non-active session to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_frozen'))
    expect((await POST(makeReq({ userId: 'user-1' }), params)).status).toBe(409)
  })
})

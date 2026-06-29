/**
 * @jest-environment node
 */
import { PATCH } from './route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = auth as jest.Mock
const mockDb = db as unknown as { select: jest.Mock }
const mockRunTransition = runMatchingTransition as jest.Mock

function activeSessionSelect(rows: unknown[] = [{ id: 'session-1' }]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain
}

function canonicalSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  }
  return chain
}

function makeReq(body: object, asUserId?: string) {
  const suffix = asUserId ? `?as=${asUserId}` : ''
  return new Request(`http://localhost/api/matching/priorities${suffix}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

describe('PATCH /api/matching/priorities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна', contactEmail: null, isAdmin: false } })
    mockDb.select
      .mockReturnValueOnce(activeSessionSelect())
      .mockReturnValueOnce(canonicalSelect([{ bookId: 'b1', rank: 1 }, { bookId: 'b2', rank: 2 }]))
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await PATCH(makeReq({ bookIds: ['b1'] }))).status).toBe(401)
  })

  it('validates that bookIds is a non-empty string array', async () => {
    mockDb.select.mockReset().mockReturnValue(activeSessionSelect())
    const res = await PATCH(makeReq({ bookIds: [] }))
    expect(res.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('reorders priorities through the transition and returns canonical ranks', async () => {
    const res = await PATCH(makeReq({ bookIds: ['b1', 'b2'] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ranks: [{ bookId: 'b1', rank: 1 }, { bookId: 'b2', rank: 2 }] })
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'u1', label: 'Анна', source: 'matching' },
      action: { type: 'reorder_priorities', userId: 'u1', bookIds: ['b1', 'b2'] },
    })
  })

  it('lets an admin reorder for an impersonated participant', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin1', name: 'Админ', contactEmail: null, isAdmin: true } })
    const res = await PATCH(makeReq({ bookIds: ['b1', 'b2'] }, 'participant1'))
    expect(res.status).toBe(200)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin1', label: 'Админ', source: 'admin' },
      action: { type: 'reorder_priorities', userId: 'participant1', bookIds: ['b1', 'b2'] },
    })
  })

  it('maps stale state to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('stale_state'))
    expect((await PATCH(makeReq({ bookIds: ['b1'] }))).status).toBe(409)
  })
})

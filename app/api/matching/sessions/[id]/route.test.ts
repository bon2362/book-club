/**
 * @jest-environment node
 */
import { PATCH } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { bumpSessionState } from '@/lib/matching/realtime/version'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockBump = bumpSessionState as jest.Mock

function makeReq(body: object) {
  return new Request('http://localhost/api/matching/sessions/session-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest
}

const adminSession = { user: { id: 'admin1', isAdmin: true } }
const userSession = { user: { id: 'user1', isAdmin: false } }
const params = { params: { id: 'session-1' } }

describe('PATCH /api/matching/sessions/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await PATCH(makeReq({ minGroupSize: 3, maxGroupSize: 4 }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid group size range', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const res = await PATCH(makeReq({ minGroupSize: 4, maxGroupSize: 3 }), params)
    expect(res.status).toBe(400)
  })

  it('updates active session group size and broadcasts state change', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'session-1', status: 'active' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(selectChain)
    const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.update = jest.fn().mockReturnValue(updateChain)

    const res = await PATCH(makeReq({ minGroupSize: 3, maxGroupSize: 4 }), params)

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith({ minGroupSize: 3, maxGroupSize: 4 })
    expect(mockBump).toHaveBeenCalledWith('session-1')
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { recordParticipantLeftEvent } from '@/lib/matching/preference-events'
import { broadcast } from '@/lib/matching/realtime/hub'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), delete: jest.fn() } }))
jest.mock('@/lib/matching/preference-events', () => ({ recordParticipantLeftEvent: jest.fn() }))
jest.mock('@/lib/matching/realtime/hub', () => ({ broadcast: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockRecordLeft = recordParticipantLeftEvent as jest.Mock
const mockBroadcast = broadcast as jest.Mock

const params = { params: { id: 'session-1', userId: 'user-1' } }

function makeReq() {
  return new NextRequest('http://localhost/api/admin/matching/sessions/session-1/participants/user-1', {
    method: 'DELETE',
  })
}

function mockSessionLookup(status: string | null) {
  mockDb.select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(status ? [{ id: 'session-1', status }] : []),
  })
}

describe('DELETE /api/admin/matching/sessions/[id]/participants/[userId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRecordLeft.mockResolvedValue(undefined)
    mockDb.delete = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
  })

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    const res = await DELETE(makeReq(), params)
    expect(res.status).toBe(403)
    expect(mockRecordLeft).not.toHaveBeenCalled()
  })

  it('пишет participant_left с source=admin и актором-админом ДО удаления', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockSessionLookup('active')

    const res = await DELETE(makeReq(), params)

    expect(res.status).toBe(200)
    expect(mockRecordLeft).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      source: 'admin',
    })
    const recordOrder = mockRecordLeft.mock.invocationCallOrder[0]
    const deleteOrder = (mockDb.delete as jest.Mock).mock.invocationCallOrder[0]
    expect(recordOrder).toBeLessThan(deleteOrder)
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
      userId: 'user-1',
      kind: 'participant_left',
    })
  })

  it('409 для неактивной сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockSessionLookup('frozen')

    const res = await DELETE(makeReq(), params)

    expect(res.status).toBe(409)
    expect(mockRecordLeft).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

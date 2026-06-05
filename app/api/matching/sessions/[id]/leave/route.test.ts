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

function makeReq() {
  return new NextRequest('http://localhost/api/matching/sessions/session-1/leave', { method: 'DELETE' })
}

function mockSessionLookup(status: string | null) {
  mockDb.select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(status ? [{ id: 'session-1', status }] : []),
  })
}

describe('DELETE /api/matching/sessions/[id]/leave', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRecordLeft.mockResolvedValue(undefined)
    mockDb.delete = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
  })

  it('401 без авторизации', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })
    expect(res.status).toBe(401)
    expect(mockRecordLeft).not.toHaveBeenCalled()
  })

  it('пишет participant_left ДО удаления и шлёт broadcast', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSessionLookup('active')

    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })

    expect(res.status).toBe(200)
    expect(mockRecordLeft).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'user-1',
      source: 'matching',
    })
    // analytics-событие записано раньше удаления участника
    const recordOrder = mockRecordLeft.mock.invocationCallOrder[0]
    const deleteOrder = (mockDb.delete as jest.Mock).mock.invocationCallOrder[0]
    expect(recordOrder).toBeLessThan(deleteOrder)
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
      kind: 'participant_left',
    })
  })

  it('409 для неактивной сессии, без записи события', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSessionLookup('frozen')

    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })

    expect(res.status).toBe(409)
    expect(mockRecordLeft).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

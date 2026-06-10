/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import * as mutationEffects from '@/lib/matching/mutation-effects'
import { bumpSessionState } from '@/lib/matching/realtime/version'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), delete: jest.fn() } }))
jest.mock('@/lib/matching/mutation-effects', () => ({
  captureMatchingMutationSnapshot: jest.fn(),
  finalizeMatchingMutationEffects: jest.fn(),
}))
jest.mock('@/lib/matching/realtime/version', () => ({ bumpSessionState: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockCapture = mutationEffects.captureMatchingMutationSnapshot as jest.Mock
const mockFinalize = mutationEffects.finalizeMatchingMutationEffects as jest.Mock
const mockBump = bumpSessionState as jest.Mock

function makeReq() {
  return new NextRequest('http://localhost/api/matching/sessions/session-1/leave', { method: 'DELETE' })
}

const fakeSnapshot = { context: {} }

// Настраиваем db.select для двух последовательных вызовов:
// 1) поиск сессии, 2) поиск псевдонима участника (внутри Promise.all)
function mockSessionAndParticipant(status: string | null, pseudonym = 'Белка') {
  let callCount = 0
  mockDb.select = jest.fn().mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // Первый select — поиск сессии
      return {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(status ? [{ id: 'session-1', status }] : []),
      }
    }
    // Второй select — поиск псевдонима участника в Promise.all
    return {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve([{ pseudonym }])),
      ),
    }
  })
}

describe('DELETE /api/matching/sessions/[id]/leave', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCapture.mockResolvedValue(fakeSnapshot)
    mockFinalize.mockResolvedValue(undefined)
    mockDb.delete = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
  })

  it('401 без авторизации', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })
    expect(res.status).toBe(401)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('записывает participant_left через finalizeMatchingMutationEffects ПОСЛЕ удаления и шлёт broadcast', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSessionAndParticipant('active', 'Белка')

    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })

    expect(res.status).toBe(200)
    expect(mockCapture).toHaveBeenCalledWith('session-1')
    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      targetUserId: 'user-1',
      actorUserId: 'user-1',
      bookId: null,
      kind: 'participant_left',
      source: 'matching',
      before: fakeSnapshot,
      skipMembershipGuard: true,
      metadata: expect.objectContaining({ pseudonym: 'Белка' }),
    }))
    // finalize вызван ПОСЛЕ delete
    const deleteOrder = (mockDb.delete as jest.Mock).mock.invocationCallOrder[0]
    const finalizeOrder = mockFinalize.mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(finalizeOrder)
    expect(mockBump).toHaveBeenCalledWith('session-1')
  })

  it('409 для неактивной сессии, без записи события', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'session-1', status: 'frozen' }]),
    })

    const res = await DELETE(makeReq(), { params: { id: 'session-1' } })

    expect(res.status).toBe(409)
    expect(mockFinalize).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import * as pseudonymsModule from '@/lib/matching/pseudonyms'
import { consumePseudonymReservation } from '@/lib/matching/pseudonym-reservations'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
}))
jest.mock('@/lib/matching/pseudonyms', () => ({
  assignPseudonym: jest.fn().mockReturnValue('Барсук'),
}))
jest.mock('@/lib/matching/pseudonym-reservations', () => ({
  consumePseudonymReservation: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const mockAssignPseudonym = pseudonymsModule.assignPseudonym as jest.Mock
const mockConsumeReservation = consumePseudonymReservation as jest.Mock

function makeReq(sessionId: string) {
  return new Request(`http://localhost/api/matching/sessions/${sessionId}/join`, {
    method: 'POST',
  }) as unknown as import('next/server').NextRequest
}

const userSession = { user: { id: 'user1', isAdmin: false } }

describe('POST /api/matching/sessions/[id]/join', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsumeReservation.mockResolvedValue(null)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when session not found', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq('bad-id'), { params: { id: 'bad-id' } })
    expect(res.status).toBe(404)
  })

  it('returns 409 when session is frozen', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'frozen' }]) }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(409)
  })

  it('returns 200 with existing pseudonym if already joined', async () => {
    mockAuth.mockResolvedValue(userSession)
    let callCount = 0
    mockDb.select = jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ id: 's1', status: 'active' }])
        return Promise.resolve([{ pseudonym: 'Выдра' }])
      }),
    }))
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pseudonym).toBe('Выдра')
  })

  it('creates new participant with pseudonym and returns 201', async () => {
    mockAuth.mockResolvedValue(userSession)
    let callCount = 0
    mockDb.select = jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ id: 's1', status: 'active' }])
        return Promise.resolve([]) // not joined yet
      }),
    }))
    // taken pseudonyms query (no limit)
    const takenChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce(takenChain)
    const insertChain = { values: jest.fn().mockResolvedValue([]) }
    mockDb.insert = jest.fn().mockReturnValue(insertChain)
    mockAssignPseudonym.mockReturnValue('Барсук')
    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.pseudonym).toBe('Барсук')
  })

  it('uses a reserved pseudonym when it is still available', async () => {
    mockAuth.mockResolvedValue(userSession)
    mockConsumeReservation.mockResolvedValue('Выдра')
    const takenChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    mockDb.select = jest.fn()
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: 's1', status: 'active' }]) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce(takenChain)
    const insertChain = { values: jest.fn().mockResolvedValue([]) }
    mockDb.insert = jest.fn().mockReturnValue(insertChain)

    const res = await POST(makeReq('s1'), { params: { id: 's1' } })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.pseudonym).toBe('Выдра')
    expect(mockAssignPseudonym).not.toHaveBeenCalled()
  })
})

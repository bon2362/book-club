/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(session?: string) {
  const url = session
    ? `http://localhost/api/matching/version?session=${session}`
    : 'http://localhost/api/matching/version'
  return new Request(url) as unknown as import('next/server').NextRequest
}

describe('GET /api/matching/version', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 without session param', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const res = await GET(makeReq())
    expect(res.status).toBe(400)
  })

  it('returns version and status for an admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 7, status: 'active' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(sessionSelect)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(200)
    // presence degrades к [] под mock-db без .update — version/status неизменны
    expect(await res.json()).toEqual({ version: 7, status: 'active', online: [] })
  })

  it('returns 403 for a non-participant non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 1, status: 'active' }]),
    }
    const participantSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(participantSelect)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(403)
  })

  it('returns 404 when the session does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn().mockReturnValue(sessionSelect)
    const res = await GET(makeReq('missing'))
    expect(res.status).toBe(404)
  })

  it('returns version and status for a participant member', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 3, status: 'frozen' }]),
    }
    const participantSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ userId: 'u1' }]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(participantSelect)
    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 3, status: 'frozen', online: [] })
  })

  it('возвращает online-псевдонимы и делает heartbeat (#338)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    const sessionSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 's1', version: 5, status: 'active' }]),
    }
    const participantSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ userId: 'u1' }]),
    }
    const presenceSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ pseudonym: 'Барсук' }, { pseudonym: 'Белка' }]),
    }
    mockDb.select = jest.fn()
      .mockReturnValueOnce(sessionSelect)
      .mockReturnValueOnce(participantSelect)
      .mockReturnValueOnce(presenceSelect)
    const setWhere = jest.fn().mockResolvedValue(undefined)
    ;(mockDb as unknown as { update: jest.Mock }).update = jest.fn()
      .mockReturnValue({ set: jest.fn().mockReturnValue({ where: setWhere }) })

    const res = await GET(makeReq('s1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 5, status: 'active', online: ['Барсук', 'Белка'] })
    expect(setWhere).toHaveBeenCalled() // heartbeat выполнен
  })
})

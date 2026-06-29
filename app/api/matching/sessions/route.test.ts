/**
 * @jest-environment node
 */
import { POST, GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({ matchingSessions: {} }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/matching/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const adminSession = { user: { id: 'admin1', isAdmin: true } }
const userSession = { user: { id: 'user1', isAdmin: false } }

describe('POST /api/matching/sessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await POST(makeRequest({ name: 'Test' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ name: 'Test' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is missing', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/name/)
  })

  it('returns 409 when active session exists', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'existing-id' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(selectChain)
    const res = await POST(makeRequest({ name: 'New session' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.activeSessionId).toBe('existing-id')
  })

  it('creates session and returns 201', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn().mockReturnValue(selectChain)
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'new-id', name: 'Test', status: 'active' }]),
    }
    mockDb.insert = jest.fn().mockReturnValue(insertChain)
    const res = await POST(makeRequest({ name: 'Test session', minGroupSize: 3, maxGroupSize: 4 }))
    expect(res.status).toBe(201)
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      minGroupSize: 3,
      maxGroupSize: 4,
    }))
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.id).toBe('new-id')
  })

  it('does not persist or return a legacy mode selector', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn().mockReturnValue(selectChain)
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'new-id', name: 'Test', status: 'active' }]),
    }
    mockDb.insert = jest.fn().mockReturnValue(insertChain)

    const res = await POST(makeRequest({
      name: 'Satisfaction session',
      minGroupSize: 3,
      maxGroupSize: 3,
      legacyMode: 'ignored',
    }))

    expect(res.status).toBe(201)
    expect(insertChain.values).toHaveBeenCalledWith(expect.not.objectContaining({
      legacyMode: expect.anything(),
    }))
    expect(await res.json()).not.toHaveProperty('data.legacyMode')
  })
})

describe('GET /api/matching/sessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 for non-admins', async () => {
    mockAuth.mockResolvedValue(userSession)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns sessions list for admin', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const selectChain = {
      from: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([{ id: 's1', name: 'Session', status: 'active' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(selectChain)
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(1)
    expect(mockDb.select).toHaveBeenCalledWith(expect.not.objectContaining({
      optimizationMode: expect.anything(),
      metricCoverage: expect.anything(),
    }))
  })
})

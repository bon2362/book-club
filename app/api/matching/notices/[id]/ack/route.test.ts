/**
 * @jest-environment node
 */
import { POST } from './route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { transaction: jest.fn(), update: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({ matchingNotices: {} }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))

const mockAuth = auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>
const req = new Request('http://localhost/api/matching/notices/n1/ack', {
  method: 'POST',
}) as unknown as import('next/server').NextRequest

describe('POST /api/matching/notices/[id]/ack', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without an authenticated user', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(req, { params: { id: 'n1' } })).status).toBe(401)
  })

  it('marks only the current user notice as read', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна' } })
    const returning = jest.fn().mockResolvedValue([{ id: 'n1' }])
    const where = jest.fn().mockReturnValue({ returning })
    const set = jest.fn().mockReturnValue({ where })
    mockDb.update = jest.fn().mockReturnValue({ set } as never)

    const response = await POST(req, { params: { id: 'n1' } })

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({ readAt: expect.any(Date) })
    expect(returning).toHaveBeenCalled()
  })

  it('returns 404 when the notice is missing or belongs to another user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Анна' } })
    const returning = jest.fn().mockResolvedValue([])
    const where = jest.fn().mockReturnValue({ returning })
    mockDb.update = jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where }) } as never)

    expect((await POST(req, { params: { id: 'missing' } })).status).toBe(404)
  })
})

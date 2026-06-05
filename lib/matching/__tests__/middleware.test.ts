/**
 * @jest-environment node
 */
import { withMatchingGuards } from '../middleware'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as jest.Mocked<typeof db>

function makeReq(url: string) {
  const u = new URL(url)
  const req = new Request(url) as unknown as import('next/server').NextRequest
  ;(req as unknown as { nextUrl: URL }).nextUrl = u
  return req
}

const userSession = { user: { id: 'u1', isAdmin: false } }
const adminSession = { user: { id: 'admin1', isAdmin: true } }

const baseUrl = 'http://localhost/api/matching/books'

describe('withMatchingGuards', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const handler = withMatchingGuards(async () => new Response('ok'))
    const res = await handler(makeReq(baseUrl), { params: {} })
    expect(res.status).toBe(401)
  })

  it('passes through for authenticated user without ?as=', async () => {
    mockAuth.mockResolvedValue(userSession)
    const handler = withMatchingGuards(async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq(baseUrl), { params: {} })
    expect(res.status).toBe(200)
  })

  it('passes mutation with ?as= for admin', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ status: 'active' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const handler = withMatchingGuards(async () => new Response('ok'), { mutates: true })
    const res = await handler(makeReq(`${baseUrl}?as=u2`), { params: {} })
    expect(res.status).toBe(200)
  })

  it('silently ignores ?as= for non-admin', async () => {
    mockAuth.mockResolvedValue(userSession)
    const innerFn = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const handler = withMatchingGuards(innerFn)
    const res = await handler(makeReq(`${baseUrl}?as=other`), { params: {} })
    expect(res.status).toBe(200)
  })

  it('returns 409 when session is frozen on mutating endpoint', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ status: 'frozen' }]),
    }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const handler = withMatchingGuards(async () => new Response('ok'), { mutates: true })
    const res = await handler(makeReq(baseUrl), { params: { id: 's1' } })
    expect(res.status).toBe(409)
  })

  it('returns 404 when no active session on mutating endpoint without sessionId', async () => {
    mockAuth.mockResolvedValue(userSession)
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockDb.select = jest.fn().mockReturnValue(chain)
    const handler = withMatchingGuards(async () => new Response('ok'), { mutates: true })
    const res = await handler(makeReq(baseUrl), { params: {} })
    expect(res.status).toBe(404)
  })

  it('passes through an admin ?as= read without any audit side-effect', async () => {
    mockAuth.mockResolvedValue(adminSession)
    const handler = withMatchingGuards(async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq(`${baseUrl}?as=u2`), { params: {} })
    expect(res.status).toBe(200)
  })
})

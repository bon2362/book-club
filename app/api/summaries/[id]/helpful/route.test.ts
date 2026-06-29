/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/summary-helpful', () => {
  class SummaryHelpfulNotFoundError extends Error {}
  const validId = '550e8400-e29b-41d4-a716-446655440000'
  const hashHelpfulVisitorId = (value: string) => value === validId ? 'valid-visitor-hash' : 'other-hash'
  return {
    SUMMARY_HELPFUL_COOKIE: '__Secure-summary-helpful',
    SUMMARY_HELPFUL_COOKIE_PATH: '/api/summaries',
    SUMMARY_HELPFUL_MAX_AGE: 31_536_000,
    SummaryHelpfulNotFoundError,
    hashHelpfulVisitorId,
    hashHelpfulVisitorCookie: (value: string | undefined) => value === validId ? hashHelpfulVisitorId(value) : null,
    createHelpfulVisitorActor: jest.fn(() => ({
      kind: 'new-visitor',
      visitorId: '550e8400-e29b-41d4-a716-446655440000',
      visitorHash: 'visitor-hash',
    })),
    getSummaryHelpfulState: jest.fn(),
    addSummaryHelpful: jest.fn(),
    removeSummaryHelpful: jest.fn(),
  }
})

import { auth } from '@/lib/auth'
import {
  SummaryHelpfulNotFoundError,
  addSummaryHelpful,
  getSummaryHelpfulState,
  hashHelpfulVisitorId,
  removeSummaryHelpful,
} from '@/lib/summary-helpful'
import { DELETE, GET, PUT } from './route'

const visitorId = '550e8400-e29b-41d4-a716-446655440000'
const params = { params: { id: 's1' } }

function request(method: string, cookie?: string) {
  return new NextRequest('http://localhost/api/summaries/s1/helpful', {
    method,
    headers: cookie ? { cookie: `__Secure-summary-helpful=${cookie}` } : undefined,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue(null)
})

describe('/api/summaries/[id]/helpful', () => {
  it('GET returns public no-store state without creating a guest cookie', async () => {
    ;(getSummaryHelpfulState as jest.Mock).mockResolvedValue({ count: 0, reacted: false })

    const response = await GET(request('GET'), params)

    await expect(response.json()).resolves.toEqual({ count: 0, reacted: false })
    expect(getSummaryHelpfulState).toHaveBeenCalledWith('s1', null)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('GET uses and refreshes a valid existing visitor cookie', async () => {
    ;(getSummaryHelpfulState as jest.Mock).mockResolvedValue({ count: 2, reacted: true })

    const response = await GET(request('GET', visitorId), params)

    expect(getSummaryHelpfulState).toHaveBeenCalledWith('s1', {
      kind: 'visitor',
      visitorHash: hashHelpfulVisitorId(visitorId),
    })
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`__Secure-summary-helpful=${visitorId}`)
    expect(setCookie).toContain('Path=/api/summaries')
    expect(setCookie).toContain('Max-Age=31536000')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=lax')
  })

  it('GET ignores and does not refresh an invalid visitor cookie', async () => {
    ;(getSummaryHelpfulState as jest.Mock).mockResolvedValue({ count: 1, reacted: false })

    const response = await GET(request('GET', 'invalid-cookie'), params)

    expect(getSummaryHelpfulState).toHaveBeenCalledWith('s1', null)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('first guest PUT creates the cookie only after persistence succeeds', async () => {
    ;(addSummaryHelpful as jest.Mock).mockResolvedValue({ count: 1, reacted: true })

    const response = await PUT(request('PUT'), params)

    expect(addSummaryHelpful).toHaveBeenCalledWith('s1', {
      kind: 'new-visitor',
      visitorId,
      visitorHash: 'visitor-hash',
    })
    expect(response.headers.get('set-cookie')).toContain(`__Secure-summary-helpful=${visitorId}`)
    await expect(response.json()).resolves.toEqual({ count: 1, reacted: true })
  })

  it('failed guest PUT never sets a cookie', async () => {
    ;(addSummaryHelpful as jest.Mock).mockRejectedValue(new Error('db unavailable'))

    const response = await PUT(request('PUT'), params)

    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' })
  })

  it('authenticated PUT and DELETE carry the account plus browser hash', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(addSummaryHelpful as jest.Mock).mockResolvedValue({ count: 1, reacted: true })
    ;(removeSummaryHelpful as jest.Mock).mockResolvedValue({ count: 0, reacted: false })

    await PUT(request('PUT', visitorId), params)
    await DELETE(request('DELETE', visitorId), params)

    const actor = { kind: 'user', userId: 'u1', visitorHash: hashHelpfulVisitorId(visitorId) }
    expect(addSummaryHelpful).toHaveBeenCalledWith('s1', actor)
    expect(removeSummaryHelpful).toHaveBeenCalledWith('s1', actor)
  })

  it('repeated guest DELETE without a cookie stays successful', async () => {
    ;(removeSummaryHelpful as jest.Mock).mockResolvedValue({ count: 0, reacted: false })

    const response = await DELETE(request('DELETE'), params)

    expect(removeSummaryHelpful).toHaveBeenCalledWith('s1', null)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ count: 0, reacted: false })
  })

  it('maps unpublished or missing summaries to 404', async () => {
    ;(getSummaryHelpfulState as jest.Mock).mockRejectedValue(new SummaryHelpfulNotFoundError())

    const response = await GET(request('GET'), params)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/summary-helpful', () => {
  class SummaryHelpfulNotFoundError extends Error {}
  const validId = '550e8400-e29b-41d4-a716-446655440000'
  return {
    SUMMARY_HELPFUL_COOKIE: '__Secure-summary-helpful',
    SUMMARY_HELPFUL_COOKIE_PATH: '/api/summaries',
    SummaryHelpfulNotFoundError,
    hashHelpfulVisitorCookie: (value: string | undefined) => value === validId ? 'visitor-hash' : null,
    reconcileSummaryHelpful: jest.fn(),
  }
})

import { auth } from '@/lib/auth'
import { SummaryHelpfulNotFoundError, reconcileSummaryHelpful } from '@/lib/summary-helpful'
import { POST } from './route'

const visitorId = '550e8400-e29b-41d4-a716-446655440000'

function request(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/summaries/helpful/reconcile', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: cookie ? { cookie: `__Secure-summary-helpful=${cookie}` } : undefined,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
})

describe('POST /api/summaries/helpful/reconcile', () => {
  it('requires an authenticated account', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const response = await POST(request({ summaryId: 's1' }, visitorId))
    expect(response.status).toBe(401)
    expect(reconcileSummaryHelpful).not.toHaveBeenCalled()
  })

  it('rejects a missing or empty summaryId', async () => {
    for (const body of [{}, { summaryId: '  ' }]) {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
    }
    expect(reconcileSummaryHelpful).not.toHaveBeenCalled()
  })

  it('atomically reconciles a valid visitor and expires the scoped cookie after success', async () => {
    ;(reconcileSummaryHelpful as jest.Mock).mockResolvedValue({ count: 1, reacted: true })

    const response = await POST(request({ summaryId: 's1' }, visitorId))

    expect(reconcileSummaryHelpful).toHaveBeenCalledWith('s1', 'u1', 'visitor-hash')
    await expect(response.json()).resolves.toEqual({ count: 1, reacted: true })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('__Secure-summary-helpful=')
    expect(setCookie).toContain('Path=/api/summaries')
    expect(setCookie).toContain('Max-Age=0')
  })

  it('ignores an invalid cookie while returning account state', async () => {
    ;(reconcileSummaryHelpful as jest.Mock).mockResolvedValue({ count: 2, reacted: false })

    const response = await POST(request({ summaryId: 's1' }, 'invalid'))

    expect(reconcileSummaryHelpful).toHaveBeenCalledWith('s1', 'u1', undefined)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('preserves the guest cookie when reconciliation fails', async () => {
    ;(reconcileSummaryHelpful as jest.Mock).mockRejectedValue(new Error('transaction rolled back'))

    const response = await POST(request({ summaryId: 's1' }, visitorId))

    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('maps unpublished summaries to 404', async () => {
    ;(reconcileSummaryHelpful as jest.Mock).mockRejectedValue(new SummaryHelpfulNotFoundError())
    const response = await POST(request({ summaryId: 'draft' }))
    expect(response.status).toBe(404)
  })
})

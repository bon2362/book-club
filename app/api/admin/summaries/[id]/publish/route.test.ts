/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  adminPublishSummary: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { adminPublishSummary } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/admin/summaries/[id]/publish', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requires admin session', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', isAdmin: false } })

    const res = await POST(new NextRequest('http://localhost/api/admin/summaries/s1/publish', { method: 'POST' }), { params: { id: 's1' } })

    expect(res.status).toBe(403)
  })

  it('publishes through admin service', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', isAdmin: true, name: 'Admin' } })
    ;(adminPublishSummary as jest.Mock).mockResolvedValue({ id: 's1', status: 'published' })

    const res = await POST(new NextRequest('http://localhost/api/admin/summaries/s1/publish', { method: 'POST' }), { params: { id: 's1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary.status).toBe('published')
    expect(adminPublishSummary).toHaveBeenCalledWith({ id: 's1', adminUserId: 'admin', actorLabel: 'Admin' })
  })
})

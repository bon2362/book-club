/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  adminPublishSummaryRevision: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { adminPublishSummaryRevision } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/admin/summary-revisions/[id]/publish', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires an admin session', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', isAdmin: false } })

    const res = await POST(new NextRequest('http://localhost/api/admin/summary-revisions/r1/publish', { method: 'POST' }), { params: { id: 'r1' } })

    expect(res.status).toBe(403)
  })

  it('publishes revision through the admin service', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', isAdmin: true, name: 'Admin' } })
    ;(adminPublishSummaryRevision as jest.Mock).mockResolvedValue({ id: 's1', status: 'published' })

    const res = await POST(new NextRequest('http://localhost/api/admin/summary-revisions/r1/publish', { method: 'POST' }), { params: { id: 'r1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary.id).toBe('s1')
    expect(adminPublishSummaryRevision).toHaveBeenCalledWith({
      id: 'r1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
    })
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  adminRejectSummaryRevision: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { adminRejectSummaryRevision } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/admin/summary-revisions/[id]/reject', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects revision with the provided reason', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', isAdmin: true, name: 'Admin' } })
    ;(adminRejectSummaryRevision as jest.Mock).mockResolvedValue({ id: 'r1', status: 'rejected' })

    const res = await POST(new NextRequest('http://localhost/api/admin/summary-revisions/r1/reject', {
      method: 'POST',
      body: JSON.stringify({ rejectionReason: 'Уточнить вывод' }),
    }), { params: { id: 'r1' } })

    expect(res.status).toBe(200)
    expect(adminRejectSummaryRevision).toHaveBeenCalledWith({
      id: 'r1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
      rejectionReason: 'Уточнить вывод',
    })
  })
})

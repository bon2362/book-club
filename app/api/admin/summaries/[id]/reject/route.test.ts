/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  adminRejectSummary: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { adminRejectSummary } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/admin/summaries/[id]/reject', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects with the provided reason', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', isAdmin: true, name: 'Admin' } })
    ;(adminRejectSummary as jest.Mock).mockResolvedValue({ id: 's1', status: 'rejected' })

    const res = await POST(new NextRequest('http://localhost/api/admin/summaries/s1/reject', {
      method: 'POST',
      body: JSON.stringify({ rejectionReason: 'Добавь выводы' }),
    }), { params: { id: 's1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary.status).toBe('rejected')
    expect(adminRejectSummary).toHaveBeenCalledWith({
      id: 's1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
      rejectionReason: 'Добавь выводы',
    })
  })
})

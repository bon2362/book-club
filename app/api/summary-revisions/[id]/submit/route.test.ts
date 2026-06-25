/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  submitAuthorSummaryRevision: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { submitAuthorSummaryRevision } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/summary-revisions/[id]/submit', () => {
  beforeEach(() => jest.clearAllMocks())

  it('submits through the author service', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', name: 'Алина' } })
    ;(submitAuthorSummaryRevision as jest.Mock).mockResolvedValue({ id: 'r1', status: 'pending' })

    const res = await POST(new NextRequest('http://localhost/api/summary-revisions/r1/submit', { method: 'POST' }), { params: { id: 'r1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.revision.status).toBe('pending')
    expect(submitAuthorSummaryRevision).toHaveBeenCalledWith({
      id: 'r1',
      userId: 'u1',
      actorLabel: 'Алина',
    })
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  openOrCreateSummaryRevision: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { openOrCreateSummaryRevision } from '@/lib/book-summaries'
import { POST } from './route'

describe('/api/summaries/[id]/revision', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires an authenticated user', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await POST(new NextRequest('http://localhost/api/summaries/s1/revision', { method: 'POST' }), { params: { id: 's1' } })

    expect(res.status).toBe(401)
  })

  it('creates a revision for the author', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', name: 'Алина' } })
    ;(openOrCreateSummaryRevision as jest.Mock).mockResolvedValue({ id: 'r1', status: 'draft' })

    const res = await POST(new NextRequest('http://localhost/api/summaries/s1/revision', { method: 'POST' }), { params: { id: 's1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.revision.id).toBe('r1')
    expect(openOrCreateSummaryRevision).toHaveBeenCalledWith({
      summaryId: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })
  })
})

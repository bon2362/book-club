/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  getAuthorSummaryForBook: jest.fn(),
  openOrCreateSummaryDraft: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { getAuthorSummaryForBook, openOrCreateSummaryDraft } from '@/lib/book-summaries'
import { GET, POST } from './route'

const session = { user: { id: 'u1', name: 'Алина', contactEmail: 'a@example.test' } }

describe('/api/summaries/by-book/[bookId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('GET returns 401 without a session', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await GET(new NextRequest('http://localhost/api/summaries/by-book/b1'), { params: { bookId: 'b1' } })

    expect(res.status).toBe(401)
  })

  it('GET returns the current user summary for the book', async () => {
    ;(auth as jest.Mock).mockResolvedValue(session)
    ;(getAuthorSummaryForBook as jest.Mock).mockResolvedValue({ id: 's1', status: 'draft' })

    const res = await GET(new NextRequest('http://localhost/api/summaries/by-book/b1'), { params: { bookId: 'b1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary).toEqual({ id: 's1', status: 'draft' })
    expect(getAuthorSummaryForBook).toHaveBeenCalledWith('b1', 'u1')
  })

  it('POST opens or creates a draft with actor label', async () => {
    ;(auth as jest.Mock).mockResolvedValue(session)
    ;(openOrCreateSummaryDraft as jest.Mock).mockResolvedValue({ id: 's1', status: 'draft' })

    const res = await POST(new NextRequest('http://localhost/api/summaries/by-book/b1', { method: 'POST' }), { params: { bookId: 'b1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.summary.id).toBe('s1')
    expect(openOrCreateSummaryDraft).toHaveBeenCalledWith({
      bookId: 'b1',
      userId: 'u1',
      actorLabel: 'Алина',
      defaultDisplayName: 'Алина',
    })
  })
})

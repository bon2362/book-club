/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  saveAuthorSummary: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { SummaryValidationError, saveAuthorSummary } from '@/lib/book-summaries'
import { PATCH } from './route'

describe('/api/summaries/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('PATCH maps validation errors to 400', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', name: 'Алина' } })
    ;(saveAuthorSummary as jest.Mock).mockRejectedValue(new SummaryValidationError('summary is not editable by author'))

    const res = await PATCH(new NextRequest('http://localhost/api/summaries/s1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New' }),
    }), { params: { id: 's1' } })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('summary is not editable by author')
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  SummaryValidationError: class SummaryValidationError extends Error {},
  saveAuthorSummaryRevision: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { SummaryValidationError, saveAuthorSummaryRevision } from '@/lib/book-summaries'
import { PATCH } from './route'

describe('/api/summary-revisions/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps domain validation errors to 400', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', name: 'Алина' } })
    ;(saveAuthorSummaryRevision as jest.Mock).mockRejectedValue(new SummaryValidationError('summary revision is not editable by author'))

    const res = await PATCH(new NextRequest('http://localhost/api/summary-revisions/r1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Новая версия' }),
    }), { params: { id: 'r1' } })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('summary revision is not editable by author')
  })
})

/**
 * @jest-environment jsdom
 */
import LegacySummaryEditPage from './page'

const redirect = jest.fn()

jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
  notFound: jest.fn(),
}))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/books', () => ({ fetchBookById: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  getAuthorSummaryById: jest.fn(),
  getActiveSummaryRevision: jest.fn(),
}))
jest.mock('@/components/nd/SummaryEditor', () => ({ __esModule: true, default: () => null }))

import { auth } from '@/lib/auth'
import { fetchBookById } from '@/lib/books'
import { getAuthorSummaryById } from '@/lib/book-summaries'

describe('/summaries/[id]/edit legacy route', () => {
  it('redirects to the friendly editor after a slug is assigned', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(getAuthorSummaryById as jest.Mock).mockResolvedValue({ id: 's1', bookId: 'b1', status: 'draft' })
    ;(fetchBookById as jest.Mock).mockResolvedValue({ id: 'b1', slug: 'kniga' })

    await LegacySummaryEditPage({ params: { id: 's1' } })

    expect(redirect).toHaveBeenCalledWith('/books/kniga/my-summary/edit')
  })
})

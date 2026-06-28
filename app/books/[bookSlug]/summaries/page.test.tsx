/**
 * @jest-environment node
 */
const redirect = jest.fn((path: string) => {
  void path
  throw new Error('NEXT_REDIRECT')
})

jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
  notFound: jest.fn(),
}))
jest.mock('@/lib/books', () => ({
  fetchBookBySlug: jest.fn(),
  fetchBookById: jest.fn(),
}))
jest.mock('@/lib/book-summaries', () => ({
  getPublishedSummariesForBook: jest.fn(),
}))
jest.mock('@/components/nd/SummaryAuthorSwitcher', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/nd/SummaryArticle', () => ({ __esModule: true, default: () => null }))

import { fetchBookById, fetchBookBySlug } from '@/lib/books'
import BookSummariesPage, { generateMetadata } from './page'

describe('/books/[bookSlug]/summaries', () => {
  beforeEach(() => jest.clearAllMocks())

  it('exposes the friendly URL as canonical metadata', async () => {
    ;(fetchBookBySlug as jest.Mock).mockResolvedValue({
      id: 'b1',
      slug: 'kniga',
      name: 'Книга',
      author: 'Автор',
    })

    await expect(generateMetadata({ params: { bookSlug: 'kniga' } })).resolves.toMatchObject({
      alternates: { canonical: '/books/kniga/summaries' },
    })
    expect(fetchBookById).not.toHaveBeenCalled()
  })

  it('redirects a legacy UUID reference to the current editable slug', async () => {
    ;(fetchBookBySlug as jest.Mock).mockResolvedValue(null)
    ;(fetchBookById as jest.Mock).mockResolvedValue({
      id: 'legacy-book-id',
      slug: 'novyi-slug',
      name: 'Книга',
      author: 'Автор',
    })

    await expect(BookSummariesPage({ params: { bookSlug: 'legacy-book-id' }, searchParams: {} })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/books/novyi-slug/summaries')
  })
})

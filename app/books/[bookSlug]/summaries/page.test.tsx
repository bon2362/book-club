/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'

const mockSummaryArticle = jest.fn<null, [unknown]>(() => null)
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
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/summary-helpful', () => ({ getSummaryHelpfulCount: jest.fn() }))
jest.mock('@/components/nd/SummaryAuthorSwitcher', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/nd/SummaryArticle', () => ({
  __esModule: true,
  default: (props: unknown) => mockSummaryArticle(props),
}))

import { fetchBookById, fetchBookBySlug } from '@/lib/books'
import { getPublishedSummariesForBook } from '@/lib/book-summaries'
import { auth } from '@/lib/auth'
import { getSummaryHelpfulCount } from '@/lib/summary-helpful'
import BookSummariesPage, { generateMetadata } from './page'

describe('/books/[bookSlug]/summaries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(null)
  })

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

  it('loads count and session state for the selected summary only', async () => {
    ;(fetchBookBySlug as jest.Mock).mockResolvedValue({
      id: 'b1', slug: 'kniga', name: 'Книга', author: 'Автор', date: '', pages: 100,
    })
    ;(getPublishedSummariesForBook as jest.Mock).mockResolvedValue([
      {
        id: 's1', displayName: 'Первая', title: 'Один', tldr: 'Кратко', bodyMarkdown: 'Текст один', publishedAt: null,
      },
      {
        id: 's2', displayName: 'Вторая', title: 'Два', tldr: 'Кратко', bodyMarkdown: 'Текст два', publishedAt: null,
      },
    ])
    ;(getSummaryHelpfulCount as jest.Mock).mockResolvedValue(7)
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })

    render(await BookSummariesPage({ params: { bookSlug: 'kniga' }, searchParams: { author: 'вторая' } }))

    expect(getSummaryHelpfulCount).toHaveBeenCalledWith('s2')
    expect(mockSummaryArticle).toHaveBeenCalledWith(expect.objectContaining({
      summaryId: 's2',
      initialHelpfulCount: 7,
      hasSession: true,
    }))
  })
})

/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import MySummaryEditPage from './page'

const notFound = jest.fn()

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: () => notFound(),
}))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/books', () => ({ fetchBookBySlug: jest.fn() }))
jest.mock('@/lib/book-summaries', () => ({
  getAuthorSummaryForBook: jest.fn(),
  getActiveSummaryRevision: jest.fn(),
}))
jest.mock('@/components/nd/SummaryEditor', () => ({
  __esModule: true,
  default: ({ bookTitle }: { bookTitle: string }) => <div data-testid="summary-editor">{bookTitle}</div>,
}))

import { auth } from '@/lib/auth'
import { fetchBookBySlug } from '@/lib/books'
import { getAuthorSummaryForBook } from '@/lib/book-summaries'

describe('/books/[bookSlug]/my-summary/edit', () => {
  it('loads the current user summary for the slugged book', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(fetchBookBySlug as jest.Mock).mockResolvedValue({ id: 'b1', slug: 'kniga', name: 'Книга', author: 'Автор' })
    ;(getAuthorSummaryForBook as jest.Mock).mockResolvedValue({
      id: 's1', bookId: 'b1', displayName: 'Автор', title: 'Заголовок', tldr: 'Коротко', bodyMarkdown: 'Текст', status: 'draft', rejectionReason: null,
    })

    render(await MySummaryEditPage({ params: { bookSlug: 'kniga' } }))

    expect(getAuthorSummaryForBook).toHaveBeenCalledWith('b1', 'u1')
    expect(screen.getByTestId('summary-editor')).toHaveTextContent('Книга')
  })
})

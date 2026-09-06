/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import BookCardMobile from './BookCardMobile'
import type { BookWithCover } from '@/lib/books-with-covers'
import { track } from '@/lib/analytics'

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: () => <div data-testid="cover-image" />,
}))

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

const mockTrack = track as jest.Mock

const book: BookWithCover = {
  id: '1',
  name: 'Сапиенс',
  author: 'Юваль Харари',
  tags: ['история', 'наука'],
  description: 'Краткая история человечества',
  date: '1/1/2011',
  pages: '500',
  link: '',
  type: 'Book',
  coverUrl: null,
  whyRead: null,
  recommendationLink: null,
  isNew: false,
  summaryCount: 0,
}

describe('nd/BookCardMobile', () => {
  beforeEach(() => {
    mockTrack.mockClear()
  })

  it('renders book title and author', () => {
    render(<BookCardMobile book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('Сапиенс')).toBeInTheDocument()
    expect(screen.getByText('Юваль Харари')).toBeInTheDocument()
  })

  it('calls onToggle with book when button clicked', () => {
    const onToggle = jest.fn()
    render(<BookCardMobile book={book} isSelected={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /хочу читать/i }))
    expect(onToggle).toHaveBeenCalledWith(book)
  })

  it('разворачивает и сворачивает описание кнопкой', () => {
    const longBook = { ...book, description: 'А'.repeat(121) }
    render(<BookCardMobile book={longBook} isSelected={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /читать далее/i }))
    expect(screen.getByRole('button', { name: /свернуть/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /свернуть/i }))
    expect(screen.getByRole('button', { name: /читать далее/i })).toBeInTheDocument()
  })

  it('шлёт book_card_expanded с id, тегами и позицией только при разворачивании, не при сворачивании', () => {
    const longBook = { ...book, description: 'А'.repeat(121) }
    const onDescriptionExpand = jest.fn()
    render(
      <BookCardMobile
        book={longBook}
        isSelected={false}
        onToggle={() => {}}
        position={2}
        onDescriptionExpand={onDescriptionExpand}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /читать далее/i }))
    expect(mockTrack).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith('book_card_expanded', {
      book_id: longBook.id,
      book_title: longBook.name,
      tags: ['история', 'наука'],
      position: 2,
      is_mobile: true,
    })
    expect(onDescriptionExpand).toHaveBeenCalledWith(longBook.id)

    mockTrack.mockClear()
    onDescriptionExpand.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /свернуть/i }))
    expect(mockTrack).not.toHaveBeenCalled()
    expect(onDescriptionExpand).not.toHaveBeenCalled()
  })

  it('шлёт book_text_opened с id и названием при клике на ссылку "читать"', () => {
    const bookWithLink = { ...book, link: 'https://example.com/book' }
    render(<BookCardMobile book={bookWithLink} isSelected={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByRole('link', { name: /читать/i }))
    expect(mockTrack).toHaveBeenCalledWith('book_text_opened', {
      book_id: bookWithLink.id,
      book_title: bookWithLink.name,
    })
  })

  it('шлёт book_summaries_opened с id и количеством саммари при клике на ссылку саммари', () => {
    const bookWithSummaries = { ...book, slug: 'dolgoe-otstuplenie', summaryCount: 3 }
    render(<BookCardMobile book={bookWithSummaries} isSelected={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByRole('link', { name: /саммари клуба/i }))
    expect(mockTrack).toHaveBeenCalledWith('book_summaries_opened', {
      book_id: bookWithSummaries.id,
      summary_count: 3,
    })
  })
})

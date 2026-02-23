/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import BookCard from './BookCard'
import type { BookWithCover } from '@/lib/books-with-covers'

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: () => <div data-testid="cover-image" />,
}))

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
  size: '',
  why: '',
  coverUrl: null,
}

describe('nd/BookCard', () => {
  it('renders book title and author', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('Сапиенс')).toBeInTheDocument()
    expect(screen.getByText('Юваль Харари')).toBeInTheDocument()
  })

  it('shows "Хочу читать" when not selected', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /хочу читать/i })).toBeInTheDocument()
  })

  it('shows "✓ Записан" when selected', () => {
    render(<BookCard book={book} isSelected={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /записан/i })).toBeInTheDocument()
  })

  it('calls onToggle with book when button clicked', () => {
    const onToggle = jest.fn()
    render(<BookCard book={book} isSelected={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith(book)
  })

  it('renders tags', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('история')).toBeInTheDocument()
    expect(screen.getByText('наука')).toBeInTheDocument()
  })
})

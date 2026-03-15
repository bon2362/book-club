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
  coverUrl: null,
  whyRead: null,
  isNew: false,
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

  it('кнопка активна и позволяет записаться при status="read"', () => {
    const readBook = { ...book, status: 'read' as const }
    render(<BookCard book={readBook} isSelected={false} onToggle={() => {}} />)
    const btn = screen.getByRole('button', { name: /хочу читать/i })
    expect(btn).not.toBeDisabled()
  })

  it('вызывает onToggle при клике на кнопку для прочитанной книги', () => {
    const onToggle = jest.fn()
    const readBook = { ...book, status: 'read' as const }
    render(<BookCard book={readBook} isSelected={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /хочу читать/i }))
    expect(onToggle).toHaveBeenCalledWith(readBook)
  })

  it('показывает бейдж "Сейчас читаем" при status="reading"', () => {
    const readingBook = { ...book, status: 'reading' as const }
    render(<BookCard book={readingBook} isSelected={false} onToggle={() => {}} />)
    expect(screen.getAllByText('Сейчас читаем').length).toBeGreaterThan(0)
  })

  it('показывает кнопку "Читать далее" для описания длиннее 120 символов', () => {
    const longBook = { ...book, description: 'А'.repeat(121) }
    render(<BookCard book={longBook} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /читать далее/i })).toBeInTheDocument()
  })

  it('разворачивает и сворачивает описание кнопкой', () => {
    const longBook = { ...book, description: 'А'.repeat(121) }
    render(<BookCard book={longBook} isSelected={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /читать далее/i }))
    expect(screen.getByRole('button', { name: /свернуть/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /свернуть/i }))
    expect(screen.getByRole('button', { name: /читать далее/i })).toBeInTheDocument()
  })

  it('не показывает кнопку "Читать далее" для короткого описания (≤120 символов)', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: /читать далее/i })).not.toBeInTheDocument()
  })

  it('не показывает блок описания при пустой description', () => {
    const noDescBook = { ...book, description: '' }
    render(<BookCard book={noDescBook} isSelected={false} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: /читать далее/i })).not.toBeInTheDocument()
  })

  it('отображает signupCount когда задан', () => {
    const bookWithCount = { ...book, signupCount: 5 }
    render(<BookCard book={bookWithCount} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('извлекает год из даты формата M/D/YYYY', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    // book.date = '1/1/2011' → должен отображаться '2011'
    expect(screen.getByText('2011')).toBeInTheDocument()
  })
})

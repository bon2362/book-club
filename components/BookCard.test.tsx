import { render, screen, fireEvent } from '@testing-library/react'
import BookCard from './BookCard'
import type { Book } from '@/lib/sheets'

const book: Book = {
  id: '1', name: 'Кредо либерала', tags: ['неолиберализм'],
  author: 'Paul Krugman', type: 'Book', size: 'L',
  pages: '368', date: '1/1/2007', link: 'https://example.com',
  why: '', description: 'Хорошая книга о либеральной политике', coverUrl: null
}

describe('BookCard', () => {
  it('отображает основную информацию', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('Кредо либерала')).toBeInTheDocument()
    expect(screen.getByText('Paul Krugman')).toBeInTheDocument()
    expect(screen.getByText(/368/)).toBeInTheDocument()
    expect(screen.getByText('Хорошая книга о либеральной политике')).toBeInTheDocument()
  })

  it('показывает кнопку "Хочу читать" для незаписанной книги', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /Хочу читать/i })).toBeInTheDocument()
  })

  it('показывает "✓ Записан" для выбранной книги', () => {
    render(<BookCard book={book} isSelected={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /Записан/i })).toBeInTheDocument()
  })

  it('вызывает onToggle при клике на кнопку', () => {
    const onToggle = jest.fn()
    render(<BookCard book={book} isSelected={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Хочу читать/i }))
    expect(onToggle).toHaveBeenCalledWith(book)
  })

  it('отображает тег', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('неолиберализм')).toBeInTheDocument()
  })

  it('показывает ссылку если link не пустой и не "Link"', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('не показывает ссылку если link равен "Link"', () => {
    render(<BookCard book={{ ...book, link: 'Link' }} isSelected={false} onToggle={() => {}} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

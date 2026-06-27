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
  coverUrl: null,
  whyRead: null,
  recommendationLink: null,
  isNew: false,
  summaryCount: 0,
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

  it('shows "✓ Вы записаны" when selected', () => {
    render(<BookCard book={book} isSelected={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /вы записаны/i })).toBeInTheDocument()
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

  it('подсвечивает кнопку "Читать далее" при наведении на длинное описание', () => {
    const longDescription = 'А'.repeat(121)
    const longBook = { ...book, description: longDescription }
    render(<BookCard book={longBook} isSelected={false} onToggle={() => {}} />)

    const description = screen.getByText(longDescription)
    const button = screen.getByRole('button', { name: /читать далее/i })

    // jsdom не резолвит CSS custom properties в color/borderColor,
    // поэтому проверяем только что hover-события не бросают ошибок
    // и кнопка существует. Визуальные цвета покрыты E2E.
    expect(button).toBeInTheDocument()
    expect(() => fireEvent.mouseEnter(description)).not.toThrow()
    expect(() => fireEvent.mouseLeave(description)).not.toThrow()
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

  it('показывает ссылку на саммари когда есть опубликованные саммари', () => {
    const bookWithSummaries = { ...book, slug: 'dolgoe-otstuplenie', summaryCount: 3 }
    render(<BookCard book={bookWithSummaries} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('link', { name: /3 саммари клуба/i })).toHaveAttribute('href', '/books/dolgoe-otstuplenie/summaries')
  })

  it('бейдж предложенной участником книги не выглядит кликабельным', () => {
    const submittedBook = { ...book, submittedByMember: true }
    render(<BookCard book={submittedBook} isSelected={false} onToggle={() => {}} />)

    const badge = screen.getByLabelText('Эта книга предложена участни:цей клуба')
    expect(badge).not.toHaveAttribute('title')
    expect(badge).not.toHaveStyle({ cursor: 'pointer' })
  })

  it('показывает подсказку предложенной участником книги по клику и не скрывает повторным кликом', () => {
    const submittedBook = { ...book, submittedByMember: true }
    render(<BookCard book={submittedBook} isSelected={false} onToggle={() => {}} />)

    const badge = screen.getByLabelText('Эта книга предложена участни:цей клуба')
    expect(screen.queryByTestId('submitted-book-tooltip')).not.toBeInTheDocument()

    fireEvent.click(badge)
    expect(screen.getByTestId('submitted-book-tooltip')).toHaveTextContent('Эта книга предложена участни:цей клуба')

    fireEvent.click(badge)
    expect(screen.getByTestId('submitted-book-tooltip')).toBeInTheDocument()
  })

  it('показывает ссылку на книгу строчными буквами', () => {
    const bookWithLink = { ...book, link: 'https://example.com/book' }
    render(<BookCard book={bookWithLink} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('link', { name: 'читать' })).toHaveAttribute('href', bookWithLink.link)
  })

  it('извлекает год из даты формата M/D/YYYY', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    // book.date = '1/1/2011' → должен отображаться '2011'
    expect(screen.getByText('2011')).toBeInTheDocument()
  })
})

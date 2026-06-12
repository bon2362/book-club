import { render, screen, act } from '@testing-library/react'
import BookDetailProvider, { useBookDetail } from './BookDetailProvider'
import type { CatalogBook } from '@/lib/matching/personal-list'
import type { MatchingBookDetail } from './MatchingBookDetailModal'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const book: MatchingBookDetail = {
  bookId: 'b1',
  title: 'Тест-книга',
  author: 'Автор',
  description: '',
  coverUrl: null,
  pages: null,
  publishedDate: '',
  textUrl: '',
  whyRead: null,
  recommendationLink: null,
  tags: [],
}

function Opener() {
  const { openBook } = useBookDetail()
  return <button onClick={() => openBook(book, [])}>open</button>
}

function inList(): CatalogBook[] {
  return [{ ...book, isInList: true, personalStatus: null, rank: 1 } as unknown as CatalogBook]
}

describe('BookDetailProvider (единый книжный попап)', () => {
  it('openBook рендерит модалку с книгой', () => {
    render(
      <BookDetailProvider personalBooks={[]} viewingUserId="u1" frozen={false}>
        <Opener />
      </BookDetailProvider>,
    )
    expect(screen.queryByText('Тест-книга')).not.toBeInTheDocument()
    act(() => { screen.getByText('open').click() })
    expect(screen.getByText('Тест-книга')).toBeInTheDocument()
  })

  it('книга В списке (по personalBooks) → показывает «Убрать из списка»', () => {
    render(
      <BookDetailProvider personalBooks={inList()} viewingUserId="u1" frozen={false}>
        <Opener />
      </BookDetailProvider>,
    )
    act(() => { screen.getByText('open').click() })
    expect(screen.getByText('Убрать из списка')).toBeInTheDocument()
    expect(screen.queryByText('Добавить в список')).not.toBeInTheDocument()
  })

  it('книга НЕ в списке → показывает «Добавить в список»', () => {
    render(
      <BookDetailProvider personalBooks={[]} viewingUserId="u1" frozen={false}>
        <Opener />
      </BookDetailProvider>,
    )
    act(() => { screen.getByText('open').click() })
    expect(screen.getByText('Добавить в список')).toBeInTheDocument()
    expect(screen.queryByText('Убрать из списка')).not.toBeInTheDocument()
  })

  it('frozen (только-чтение) → контролов нет', () => {
    render(
      <BookDetailProvider personalBooks={inList()} viewingUserId="u1" frozen>
        <Opener />
      </BookDetailProvider>,
    )
    act(() => { screen.getByText('open').click() })
    expect(screen.getByText('Тест-книга')).toBeInTheDocument()
    expect(screen.queryByText('Убрать из списка')).not.toBeInTheDocument()
    expect(screen.queryByText('Добавить в список')).not.toBeInTheDocument()
  })
})

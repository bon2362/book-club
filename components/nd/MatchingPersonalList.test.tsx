import { render } from '@testing-library/react'
import MatchingPersonalList from './MatchingPersonalList'
import type { CatalogBook } from '@/lib/matching/personal-list'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const myBook = {
  bookId: 'b1',
  title: 'Книга A',
  author: 'Автор A',
  coverUrl: null,
  description: '',
  pages: null,
  publishedDate: '',
  textUrl: '',
  whyRead: null,
  recommendationLink: null,
  tags: [],
  rank: 1,
  personalStatus: null,
  isInList: true,
} as unknown as CatalogBook

const catalogBook = {
  bookId: 'b2',
  title: 'Книга B',
  author: 'Автор B',
  coverUrl: null,
  description: '',
  pages: null,
  publishedDate: '',
  textUrl: '',
  whyRead: null,
  recommendationLink: null,
  tags: [],
  rank: null,
  personalStatus: null,
  isInList: false,
} as unknown as CatalogBook

function renderList(extra: Record<string, unknown>) {
  return render(
    <MatchingPersonalList
      books={[myBook, catalogBook]}
      bookParticipants={[]}
      viewingUserId="u1"
      {...extra}
    />,
  )
}

test('large size uses 52px cover width', () => {
  const { container } = renderList({ size: 'large' })
  const cover = container.querySelector('[data-testid="pl-cover"]') as HTMLElement
  expect(cover).toBeTruthy()
  expect(cover.style.width).toBe('52px')
})

test('compact size (default) uses 40px cover width', () => {
  const { container } = renderList({})
  const cover = container.querySelector('[data-testid="pl-cover"]') as HTMLElement
  expect(cover).toBeTruthy()
  expect(cover.style.width).toBe('40px')
})

test('fill makes the book list scrollable', () => {
  const { container } = renderList({ fill: true })
  const ul = container.querySelector('[data-testid="pl-books-ul"]') as HTMLElement
  expect(ul).toBeTruthy()
  expect(ul.style.overflowY).toBe('auto')
})

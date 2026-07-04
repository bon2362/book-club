import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingPersonalList from './MatchingPersonalList'
import type { CatalogBook } from '@/lib/matching/personal-list'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

const addToList = jest.fn().mockResolvedValue(undefined)
const patchPriorities = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/matching/personal-list-mutations', () => ({
  addToList: (...args: unknown[]) => addToList(...args),
  patchPriorities: (...args: unknown[]) => patchPriorities(...args),
  patchStatus: jest.fn().mockResolvedValue(undefined),
  removeFromList: jest.fn().mockResolvedValue(undefined),
}))

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

const unrankedMyBook = {
  bookId: 'b3',
  title: 'Книга без приоритета',
  author: 'Автор C',
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
  isInList: true,
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

test('unranked active books are shown first with a calculation warning', () => {
  const { container, getByText } = render(
    <MatchingPersonalList
      books={[myBook, unrankedMyBook, catalogBook]}
      bookParticipants={[]}
      viewingUserId="u1"
    />,
  )

  const rows = Array.from(container.querySelectorAll('[data-testid="pl-books-ul"] > li'))
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Книга без приоритета')
  expect(rows[1]).toHaveTextContent('Книга A')
  expect(rows[1]).toHaveTextContent('#1')
  expect(getByText('Книги без приоритета не участвуют в расчете')).toBeInTheDocument()
})

test('adding a book from the catalog on the board saves it to the server as rank #1 (no ranking-gate bounce)', async () => {
  refresh.mockClear()
  addToList.mockClear()
  patchPriorities.mockClear()

  render(
    <MatchingPersonalList
      books={[myBook, catalogBook]}
      bookParticipants={[]}
      viewingUserId="u1"
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Хочу читать' }))

  await waitFor(() => expect(addToList).toHaveBeenCalledWith('b2', undefined))
  await waitFor(() => expect(patchPriorities).toHaveBeenCalledWith(['b2', 'b1'], undefined, undefined))
  // addToList must resolve before patchPriorities fires (FK signup_books → book_priorities).
  expect(addToList.mock.invocationCallOrder[0]).toBeLessThan(patchPriorities.mock.invocationCallOrder[0])
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

test('excludes the viewer from popup chips by opaque ref', () => {
  render(
    <MatchingPersonalList
      books={[myBook]}
      bookParticipants={[
        { ref: 'viewer-ref', bookId: 'b1', displayName: 'Viewer Name', rank: 1, personalStatus: null },
        { ref: 'participant-ref-opaque', bookId: 'b1', displayName: 'Other Name', rank: 2, personalStatus: null },
      ]}
      viewingUserId="viewer-ref"
    />,
  )

  fireEvent.click(screen.getByText('Книга A'))
  expect(screen.queryByText('Viewer Name')).toBeNull()
  expect(screen.getByText('Other Name')).toBeInTheDocument()
})

import { fireEvent, render, screen } from '@testing-library/react'
import MatchingLockedCircles from './MatchingLockedCircles'

const openBook = jest.fn()
jest.mock('./BookDetailProvider', () => ({ useBookDetail: () => ({ openBook }) }))

const booksById = {
  b1: { bookId: 'b1', title: 'Война и мир', author: 'Лев Толстой', coverUrl: '/war.jpg', description: '', pages: 1000, publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [] },
  b2: { bookId: 'b2', title: 'B', author: 'Автор B', coverUrl: '/b.jpg', description: '', pages: null, publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [] },
}

function circle(over: Partial<{ circleKey: string; bookId: string; members: { ref: string; displayName: string }[] }> = {}) {
  return {
    circleKey: over.circleKey ?? 'key-1',
    bookId: over.bookId ?? 'b1',
    lockedAt: '2026-06-29T10:00:00.000Z',
    members: over.members ?? [
      { ref: 'r1', displayName: 'Анна' },
      { ref: 'r2', displayName: 'Борис' },
    ],
  }
}

test('renders nothing without locked circles', () => {
  const { container } = render(
    <MatchingLockedCircles circles={[]} viewerLockedCircleKey={null} />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('lists each locked circle with member names and book title', () => {
  render(
    <MatchingLockedCircles
      circles={[circle()]}
      viewerLockedCircleKey={null}
      booksById={booksById}
    />,
  )
  expect(screen.getByText('Война и мир')).toBeInTheDocument()
  expect(screen.getByText('Анна')).toBeInTheDocument()
  expect(screen.getByText('Борис')).toBeInTheDocument()
  expect(screen.queryByText('Вы наблюдаете')).toBeNull()
})

test('marks the viewer’s own circle with an observer badge', () => {
  render(
    <MatchingLockedCircles
      circles={[circle({ circleKey: 'key-1' }), circle({ circleKey: 'key-2', bookId: 'b2' })]}
      viewerLockedCircleKey="key-2"
      booksById={booksById}
    />,
  )
  const badges = screen.getAllByText('Вы наблюдаете')
  expect(badges).toHaveLength(1)
})

test('renders the viewer locked circle first as the primary observer result', () => {
  render(<MatchingLockedCircles circles={[circle({ circleKey: 'key-1' }), circle({ circleKey: 'key-2', bookId: 'b2' })]} viewerLockedCircleKey="key-2" booksById={booksById} />)
  const own = screen.getByTestId('matching-own-locked-circle')
  expect(own).toContainElement(screen.getByRole('heading', { name: 'Ваш круг' }))
  expect(own).toHaveTextContent('Все участники подтвердили состав')
  expect(own).toHaveTextContent(/больше не участвуете в расчётах/)
  expect(own).toContainElement(screen.getByAltText('Обложка: B'))
  expect(screen.queryByText(/Telegram/i)).toBeNull()
  expect(screen.getByTestId('matching-locked-registry')).toBeInTheDocument()
})

test('opens the shared popup from a locked circle title', () => {
  render(<MatchingLockedCircles circles={[circle()]} viewerLockedCircleKey="key-1" booksById={booksById} />)
  fireEvent.click(screen.getByRole('button', { name: 'Война и мир' }))
  expect(openBook).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'b1' }), expect.any(Array))
})

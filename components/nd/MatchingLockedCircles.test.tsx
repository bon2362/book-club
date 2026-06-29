import { render, screen } from '@testing-library/react'
import MatchingLockedCircles from './MatchingLockedCircles'

function circle(over: Partial<{ id: string; bookId: string; members: { ref: string; displayName: string }[] }> = {}) {
  return {
    id: over.id ?? 'c1',
    circleKey: 'key-1',
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
    <MatchingLockedCircles circles={[]} viewerLockedCircleId={null} />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('lists each locked circle with member names and book title', () => {
  render(
    <MatchingLockedCircles
      circles={[circle()]}
      viewerLockedCircleId={null}
      bookTitleById={{ b1: 'Война и мир' }}
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
      circles={[circle({ id: 'c1' }), circle({ id: 'c2', bookId: 'b2' })]}
      viewerLockedCircleId="c2"
      bookTitleById={{ b1: 'A', b2: 'B' }}
    />,
  )
  const badges = screen.getAllByText('Вы наблюдаете')
  expect(badges).toHaveLength(1)
})

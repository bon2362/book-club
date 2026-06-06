import { render, screen, fireEvent } from '@testing-library/react'
import MatchingSatisfactionFlow from './MatchingSatisfactionFlow'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  })
  window.scrollTo = () => {}
})

const base = { books: [], bookParticipants: [], viewingUserId: 'u1', sessionId: 's1' }

test('gate phase shows the ranking intro and CTA, no eyebrow', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Сначала расставьте приоритеты' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).toHaveTextContent('Войти в сессию')
  expect(screen.queryByText(/Режим: удовлетвор/i)).toBeNull()
})

test('gate phase footer uses the single hint for all states', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByText('Расставьте приоритеты и сможете войти в сессию.')).toBeInTheDocument()
})

test('board phase renders header and workspace slots', () => {
  render(
    <MatchingSatisfactionFlow phase="board" {...base}
      header={<div data-testid="slot-header" />}
      workspace={<div data-testid="slot-workspace" />} />,
  )
  expect(screen.getByTestId('slot-header')).toBeInTheDocument()
  expect(screen.getByTestId('slot-workspace')).toBeInTheDocument()
})

test('clicking enter on a ranked gate adds is-board to the root', () => {
  const ranked = [
    { bookId: 'b1', title: 'A', author: 'A', coverUrl: null, rank: 1, personalStatus: null, isInList: true, tags: [] },
  ] as unknown as import('@/lib/matching/personal-list').CatalogBook[]
  const { container } = render(
    <MatchingSatisfactionFlow phase="gate" {...base} books={ranked} />,
  )
  const enter = screen.getByTestId('ranking-gate-enter')
  // CTA enabled because the single active book is ranked
  expect(enter).not.toBeDisabled()
  fireEvent.click(enter)
  expect(container.querySelector('.nd-flow.is-board')).not.toBeNull()
})

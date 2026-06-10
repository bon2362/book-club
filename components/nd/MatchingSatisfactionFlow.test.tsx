import { render, screen, fireEvent } from '@testing-library/react'
import MatchingSatisfactionFlow from './MatchingSatisfactionFlow'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

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

beforeEach(() => refresh.mockClear())

const base = { sessionId: 's1', books: [], bookParticipants: [], viewingUserId: 'u1' }

test('gate phase shows the ranking intro and CTA, no eyebrow', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Расставь приоритеты' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).toHaveTextContent('Войти в сессию')
  expect(screen.queryByText(/Режим: удовлетвор/i)).toBeNull()
})

test('gate footer uses the single hint for all states', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByText('Расставь приоритеты и сможешь войти в сессию.')).toBeInTheDocument()
})

test('gate CTA is disabled until an active book is ranked', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByTestId('ranking-gate-enter')).toBeDisabled()
})

test('board phase renders header and workspace slots', () => {
  render(
    <MatchingSatisfactionFlow
      phase="board"
      {...base}
      header={<div data-testid="slot-header" />}
      workspace={<div data-testid="slot-workspace" />}
    />,
  )
  expect(screen.getByTestId('slot-header')).toBeInTheDocument()
  expect(screen.getByTestId('slot-workspace')).toBeInTheDocument()
})

test('clicking enter on a ranked gate refreshes and shows the submitting state', () => {
  const ranked = [
    { bookId: 'b1', title: 'A', author: 'A', coverUrl: null, rank: 1, personalStatus: null, isInList: true, tags: [] },
  ] as unknown as import('@/lib/matching/personal-list').CatalogBook[]
  render(<MatchingSatisfactionFlow phase="gate" {...base} books={ranked} />)
  const enter = screen.getByTestId('ranking-gate-enter')
  expect(enter).not.toBeDisabled()
  fireEvent.click(enter)
  // The morph itself plays when the server returns phase="board"; the click only
  // commits + refreshes and locks the button.
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(enter).toBeDisabled()
  expect(enter).toHaveTextContent('Входим')
})

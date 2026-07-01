import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingSatisfactionFlow from './MatchingSatisfactionFlow'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

const patchPriorities = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/matching/personal-list-mutations', () => ({
  patchPriorities: (...args: unknown[]) => patchPriorities(...args),
  patchStatus: jest.fn().mockResolvedValue(undefined),
  addToList: jest.fn().mockResolvedValue(undefined),
  removeFromList: jest.fn().mockResolvedValue(undefined),
}))

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

beforeEach(() => {
  refresh.mockClear()
  patchPriorities.mockClear()
})

const base = { sessionId: 's1', books: [], bookParticipants: [], viewingUserId: 'u1' }

const oneActiveUnranked = [
  { bookId: 'b1', title: 'A', author: 'A', coverUrl: null, rank: null, personalStatus: null, isInList: true, tags: [] },
] as unknown as import('@/lib/matching/personal-list').CatalogBook[]

test('empty list: shows the "choose books" copy and disabled CTA', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Выбери книги для клуба' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).toHaveTextContent('Войти в сессию')
  expect(screen.getByTestId('ranking-gate-enter')).toBeDisabled()
  expect(screen.getByText(/добавь хотя бы одну книгу, чтобы войти/i)).toBeInTheDocument()
})

test('has an active book: shows the "set priorities" copy and enabled CTA even unranked', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} books={oneActiveUnranked} />)
  expect(screen.getByRole('heading', { name: 'Сначала — расставь приоритеты' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).not.toBeDisabled()
  expect(screen.getByText(/перетащи книги по важности и входи в сессию/i)).toBeInTheDocument()
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

test('gate phase does not mount board slots from the shared page composition', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} header={<div data-testid="slot-header" />} workspace={<div data-testid="slot-workspace" />} />)
  expect(screen.queryByTestId('slot-header')).toBeNull()
  expect(screen.queryByTestId('slot-workspace')).toBeNull()
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
})

test('clicking enter on a ranked gate refreshes and shows the submitting state', async () => {
  const ranked = [
    { bookId: 'b1', title: 'A', author: 'A', coverUrl: null, rank: 1, personalStatus: null, isInList: true, tags: [] },
  ] as unknown as import('@/lib/matching/personal-list').CatalogBook[]
  render(<MatchingSatisfactionFlow phase="gate" {...base} books={ranked} />)
  const enter = screen.getByTestId('ranking-gate-enter')
  expect(enter).not.toBeDisabled()
  fireEvent.click(enter)
  // The morph itself plays when the server returns phase="board"; the click only
  // commits + refreshes and locks the button.
  expect(enter).toBeDisabled()
  expect(enter).toHaveTextContent('Входим')
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
})

test('single-book gate: clicking enter commits priorities for that book, then refreshes (#4)', async () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} books={oneActiveUnranked} />)
  const enter = screen.getByTestId('ranking-gate-enter')
  expect(enter).not.toBeDisabled()
  fireEvent.click(enter)
  await waitFor(() => expect(patchPriorities).toHaveBeenCalledWith(['b1'], undefined, 'matching_priority_gate'))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
})

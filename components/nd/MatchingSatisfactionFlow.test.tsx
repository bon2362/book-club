import { render, screen, fireEvent } from '@testing-library/react'
import MatchingSatisfactionFlow, { MATCHING_ENTERED_KEY } from './MatchingSatisfactionFlow'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

const base = { books: [], bookParticipants: [], viewingUserId: 'u1', sessionId: 's1' }

beforeEach(() => {
  refresh.mockClear()
  try {
    sessionStorage.clear()
  } catch {
    /* jsdom always provides sessionStorage */
  }
})

test('gate shows the ranking intro and CTA, no eyebrow', () => {
  render(<MatchingSatisfactionFlow {...base} />)
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Сначала расставьте приоритеты' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).toHaveTextContent('Войти в сессию')
  expect(screen.queryByText(/Режим: удовлетвор/i)).toBeNull()
})

test('footer uses the single hint for all states', () => {
  render(<MatchingSatisfactionFlow {...base} />)
  expect(screen.getByText('Расставьте приоритеты и сможете войти в сессию.')).toBeInTheDocument()
})

test('CTA is disabled when no active book is ranked', () => {
  render(<MatchingSatisfactionFlow {...base} />)
  expect(screen.getByTestId('ranking-gate-enter')).toBeDisabled()
})

test('clicking enter on a ranked gate sets the entered flag and refreshes', () => {
  const ranked = [
    { bookId: 'b1', title: 'A', author: 'A', coverUrl: null, rank: 1, personalStatus: null, isInList: true, tags: [] },
  ] as unknown as import('@/lib/matching/personal-list').CatalogBook[]
  render(<MatchingSatisfactionFlow {...base} books={ranked} />)
  const enter = screen.getByTestId('ranking-gate-enter')
  expect(enter).not.toBeDisabled()
  fireEvent.click(enter)
  expect(sessionStorage.getItem(MATCHING_ENTERED_KEY)).toBe('s1')
  expect(refresh).toHaveBeenCalledTimes(1)
})

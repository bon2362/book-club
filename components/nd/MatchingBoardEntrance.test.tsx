import { render, screen } from '@testing-library/react'
import MatchingBoardEntrance from './MatchingBoardEntrance'
import { MATCHING_ENTERED_KEY } from './MatchingSatisfactionFlow'

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
})

beforeEach(() => sessionStorage.clear())

test('always renders its children', () => {
  render(
    <MatchingBoardEntrance sessionId="s1">
      <div data-testid="board">board</div>
    </MatchingBoardEntrance>,
  )
  expect(screen.getByTestId('board')).toBeInTheDocument()
})

test('consumes the entered flag for the matching session', () => {
  sessionStorage.setItem(MATCHING_ENTERED_KEY, 's1')
  render(
    <MatchingBoardEntrance sessionId="s1">
      <div data-testid="board">board</div>
    </MatchingBoardEntrance>,
  )
  // The flag is one-shot: cleared after the entrance so refreshes don't re-animate.
  expect(sessionStorage.getItem(MATCHING_ENTERED_KEY)).toBeNull()
  expect(screen.getByTestId('board')).toBeInTheDocument()
})

test('leaves a flag for a different session untouched', () => {
  sessionStorage.setItem(MATCHING_ENTERED_KEY, 'other')
  render(
    <MatchingBoardEntrance sessionId="s1">
      <div data-testid="board">board</div>
    </MatchingBoardEntrance>,
  )
  expect(sessionStorage.getItem(MATCHING_ENTERED_KEY)).toBe('other')
})

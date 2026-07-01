import { render, screen } from '@testing-library/react'
import MatchingWorkspace from './MatchingWorkspace'
import { MatchingBoardContext } from './MatchingBoardProvider'

test('renders a full-width scenarios workspace with an internal scroll region', () => {
  render(<MatchingWorkspace scenarioCount={3}><div>scenario body</div></MatchingWorkspace>)
  expect(screen.getByRole('heading', { name: /Сценарии · 3/ })).toBeInTheDocument()
  expect(screen.getByText(/Расклады по близости интересов/)).toBeInTheDocument()
  expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ overflowY: 'auto' })
  expect(screen.queryByText(/Мои ходы|Лента событий/)).toBeNull()
})

test('fades and marks the workspace busy while scenarios recalculate', () => {
  render(
    <MatchingBoardContext.Provider value={{ pending: true, beginPending: jest.fn(), endPending: jest.fn() }}>
      <MatchingWorkspace scenarioCount={1}><div>scenario body</div></MatchingWorkspace>
    </MatchingBoardContext.Provider>,
  )
  expect(screen.getByTestId('matching-scenarios-workspace')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByTestId('matching-board-loader')).toBeInTheDocument()
  expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ opacity: '0.45' })
})

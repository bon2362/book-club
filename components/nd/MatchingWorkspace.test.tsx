import { render, screen } from '@testing-library/react'
import MatchingWorkspace from './MatchingWorkspace'
import { MatchingBoardContext } from './MatchingBoardProvider'

test('renders a full-width scenarios workspace with an internal scroll region and no panel heading', () => {
  render(<MatchingWorkspace><div>scenario body</div></MatchingWorkspace>)
  expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ overflowY: 'auto' })
  expect(screen.queryByRole('heading', { name: /Сценарии/ })).toBeNull()
  expect(screen.queryByText(/Расклады по близости интересов/)).toBeNull()
  expect(screen.queryByText(/Мои ходы|Лента событий/)).toBeNull()
})

test('fades and marks the workspace busy while scenarios recalculate', () => {
  render(
    <MatchingBoardContext.Provider value={{ pending: true, beginPending: jest.fn(), endPending: jest.fn() }}>
      <MatchingWorkspace><div>scenario body</div></MatchingWorkspace>
    </MatchingBoardContext.Provider>,
  )
  expect(screen.getByTestId('matching-scenarios-workspace')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByTestId('matching-board-loader')).toBeInTheDocument()
  expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ opacity: '0.45' })
})

test('uses natural document flow for the book tab', () => {
  render(<MatchingWorkspace natural><div>book body</div></MatchingWorkspace>)
  expect(screen.getByTestId('matching-scenarios-workspace')).toHaveClass('is-document')
  expect(screen.getByTestId('matching-scenarios-workspace')).toHaveStyle({ height: 'auto', overflow: 'visible' })
  expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ overflowY: 'visible' })
  expect(document.querySelector('.nd-mx-fade')).not.toBeInTheDocument()
})

test('keeps the pending indicator in the viewport in natural document flow', () => {
  render(
    <MatchingBoardContext.Provider value={{ pending: true, beginPending: jest.fn(), endPending: jest.fn() }}>
      <MatchingWorkspace natural><div>book body</div></MatchingWorkspace>
    </MatchingBoardContext.Provider>,
  )
  expect(screen.getByTestId('matching-board-loader')).toHaveStyle({ position: 'fixed' })
})

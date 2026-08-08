import { render, screen } from '@testing-library/react'
import MatchingWorkspace from './MatchingWorkspace'
import { MatchingBoardContext } from './MatchingBoardProvider'

test('renders a full-width workspace with an internal scroll region', () => {
  render(<MatchingWorkspace><div>board body</div></MatchingWorkspace>)
  expect(screen.getByTestId('matching-workspace-scroll')).toHaveStyle({ overflowY: 'auto' })
})

test('fades and marks the workspace busy while the board refreshes', () => {
  render(
    <MatchingBoardContext.Provider value={{ pending: true, beginPending: jest.fn(), endPending: jest.fn() }}>
      <MatchingWorkspace><div>board body</div></MatchingWorkspace>
    </MatchingBoardContext.Provider>,
  )
  expect(screen.getByTestId('matching-workspace')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByTestId('matching-board-loader')).toBeInTheDocument()
  expect(screen.getByTestId('matching-workspace-scroll')).toHaveStyle({ opacity: '0.45' })
})

test('uses natural document flow for the book board', () => {
  render(<MatchingWorkspace natural><div>book body</div></MatchingWorkspace>)
  expect(screen.getByTestId('matching-workspace')).toHaveClass('is-document')
  expect(screen.getByTestId('matching-workspace')).toHaveStyle({ height: 'auto', overflow: 'visible' })
  expect(screen.getByTestId('matching-workspace-scroll')).toHaveStyle({ overflowY: 'visible' })
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

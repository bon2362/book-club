import { fireEvent, render, screen } from '@testing-library/react'
import MatchingBookCard from './MatchingBookCard'
import type { MatchingBookView } from './matching-book-types'

const book: MatchingBookView = {
  bookId: 'b1', title: 'Патриот', author: 'Автор', coverUrl: null,
  intersectionCount: 3, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
  participants: [
    { ref: 'p1', displayName: 'Анна', status: 'hard' },
    { ref: 'p2', displayName: 'Борис', status: 'conditional' },
    { ref: 'p3', displayName: 'Вера', status: 'interest' },
  ],
  circles: [], unplacedParticipantRefs: [],
  allowedActions: { conditional: true, hard: true, cancelHard: false },
}

const baseProps = {
  viewerRef: 'viewer', viewerAssignmentBookId: null, viewerHardBookId: null,
  readOnly: false, pendingAction: null, onCommand: jest.fn(), onOpenBook: jest.fn(),
}

describe('MatchingBookCard', () => {
  beforeEach(() => { baseProps.onCommand.mockClear(); baseProps.onOpenBook.mockClear() })

  it('shows the hybrid status summary and primary copy', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    expect(screen.getByText(/1 уже записался · 1 готов читать · ещё 1 держит/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Записать' })).toBeInTheDocument()
    expect(screen.getByLabelText('Определившиеся участники')).toHaveTextContent('Анна')
    expect(screen.getByLabelText('Определившиеся участники')).not.toHaveTextContent('Вера')
  })

  it('uses switch copy when hard choice exists elsewhere', () => {
    render(<MatchingBookCard book={book} {...baseProps} viewerHardBookId="b2" />)
    expect(screen.getByRole('button', { name: 'Записаться сюда' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готов читать' })).toBeDisabled()
  })

  it('emits a hard command from the initiating button', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записать' }))
    expect(baseProps.onCommand).toHaveBeenCalledWith('setHard', 'b1', expect.any(HTMLButtonElement))
  })

  it('renders assignment as read-only', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'assigned', formedAt: '2026-07-13T10:00:00Z' }} {...baseProps} viewerAssignmentBookId="b1" />)
    expect(screen.getByText('✓ Вы назначены на эту книгу')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Записать' })).not.toBeInTheDocument()
  })
})

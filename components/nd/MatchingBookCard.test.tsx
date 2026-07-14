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
    expect(screen.getByText('1 уже записался')).toBeInTheDocument()
    expect(screen.getByText('ещё 3 добавили эту книгу')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Записать' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готов читать · 1' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Определившиеся участники')).not.toBeInTheDocument()
  })

  it('uses the singular Russian form for counts ending in one except eleven', () => {
    const participants = Array.from({ length: 21 }, (_, index) => ({
      ref: `p${index}`,
      displayName: `Участник ${index}`,
      status: 'hard' as const,
    }))
    const { rerender } = render(
      <MatchingBookCard book={{ ...book, intersectionCount: 21, participants }} {...baseProps} />,
    )
    expect(screen.getByText('21 уже записался')).toBeInTheDocument()
    expect(screen.getByText('ещё 21 добавил эту книгу')).toBeInTheDocument()

    rerender(<MatchingBookCard book={{ ...book, intersectionCount: 11, participants: participants.slice(0, 11) }} {...baseProps} />)
    expect(screen.getByText('11 уже записались')).toBeInTheDocument()
    expect(screen.getByText('ещё 11 добавили эту книгу')).toBeInTheDocument()
  })

  it('shows admin controls without repeating participant-action copy', () => {
    const { container } = render(
      <MatchingBookCard book={book} {...baseProps} adminMode adminControls={<button>Управлять составом</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Управлять составом' })).toBeInTheDocument()
    expect(screen.queryByText('Административный режим — выбор участника недоступен')).not.toBeInTheDocument()
    expect(container.querySelector('.nd-mb-actions')).not.toBeInTheDocument()
  })

  it('shows unplaced participants only after the book has formed', () => {
    const assignedBook = {
      ...book,
      participants: [...book.participants, { ref: 'viewer', displayName: 'Евгений', status: 'assigned' as const }],
      unplacedParticipantRefs: ['viewer'],
    }
    const { rerender } = render(<MatchingBookCard book={assignedBook} {...baseProps} />)
    expect(screen.queryByText('Без круга: Евгений')).not.toBeInTheDocument()

    rerender(<MatchingBookCard book={{ ...assignedBook, formedAt: '2026-07-14T08:00:00Z' }} {...baseProps} />)
    expect(screen.getByText('Без круга: Евгений')).toBeInTheDocument()
  })

  it('uses switch copy when hard choice exists elsewhere', () => {
    render(<MatchingBookCard book={book} {...baseProps} viewerHardBookId="b2" />)
    expect(screen.getByRole('button', { name: 'Записаться сюда' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готов читать · 1' })).toBeDisabled()
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

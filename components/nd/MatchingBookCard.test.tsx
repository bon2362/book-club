import { fireEvent, render, screen } from '@testing-library/react'
import MatchingBookCard from './MatchingBookCard'
import type { MatchingBookView } from './matching-book-types'

const book: MatchingBookView = {
  bookId: 'b1', title: 'Патриот', author: 'Автор', coverUrl: null,
  intersectionCount: 3, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
  participants: [
    { ref: 'p1', displayName: 'Анна', status: 'hard', rank: 1 },
    { ref: 'p2', displayName: 'Борис', status: 'conditional', rank: 2 },
    { ref: 'p3', displayName: 'Вера', status: 'interest', rank: 4 },
  ],
  circles: [], unplacedParticipantRefs: [],
  allowedActions: { conditional: true, hard: true, cancelHard: false },
  conditionalWouldAssign: false,
}

const baseProps = {
  viewerRef: 'viewer', viewerAssignmentBookId: null, viewerHardBookId: null,
  readOnly: false, pendingAction: null, onCommand: jest.fn(), onOpenBook: jest.fn(),
}

describe('MatchingBookCard', () => {
  beforeEach(() => { baseProps.onCommand.mockClear(); baseProps.onOpenBook.mockClear() })

  it('renders the three mutually-exclusive aggregate groups as buttons', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    expect(screen.getByRole('button', { name: '1 уже записал:ась' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 готов:а читать' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ещё у 1 эта книга в списке' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    // The conditional CTA carries no count anymore.
    expect(screen.getByRole('button', { name: 'Готов:а читать' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Определившиеся участники')).not.toBeInTheDocument()
  })

  it('excludes the viewer from the interest group and hides empty groups', () => {
    const viewerInterest = {
      ...book,
      participants: [
        { ref: 'viewer', displayName: 'Вы', status: 'interest' as const, rank: 1 },
        { ref: 'p3', displayName: 'Вера', status: 'interest' as const, rank: 4 },
      ],
    }
    render(<MatchingBookCard book={viewerInterest} {...baseProps} />)
    expect(screen.getByRole('button', { name: 'ещё у 1 эта книга в списке' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /уже записал/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /готов/ })).not.toBeInTheDocument()
  })

  it('opens the shared book popup from any aggregate button', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'ещё у 1 эта книга в списке' }))
    expect(baseProps.onOpenBook).toHaveBeenCalledWith(book, expect.any(HTMLButtonElement))
  })

  it('uses the singular Russian form for counts ending in one except eleven', () => {
    const participants = Array.from({ length: 21 }, (_, index) => ({
      ref: `p${index}`,
      displayName: `Участник ${index}`,
      status: 'hard' as const,
      rank: index + 1,
    }))
    const { rerender } = render(
      <MatchingBookCard book={{ ...book, participants }} {...baseProps} />,
    )
    expect(screen.getByRole('button', { name: '21 уже записал:ась' })).toBeInTheDocument()

    rerender(<MatchingBookCard book={{ ...book, participants: participants.slice(0, 11) }} {...baseProps} />)
    expect(screen.getByRole('button', { name: '11 уже записались' })).toBeInTheDocument()
  })

  it('pluralises the conditional group like the ready-to-read wording', () => {
    const conditional = (length: number) => ({
      ...book,
      participants: Array.from({ length }, (_, index) => ({
        ref: `c${index}`, displayName: `Готовый ${index}`, status: 'conditional' as const, rank: index + 1,
      })),
    })
    const { rerender } = render(<MatchingBookCard book={conditional(2)} {...baseProps} />)
    expect(screen.getByRole('button', { name: '2 готовы читать' })).toBeInTheDocument()
    rerender(<MatchingBookCard book={conditional(1)} {...baseProps} />)
    expect(screen.getByRole('button', { name: '1 готов:а читать' })).toBeInTheDocument()
  })

  it('hides the conditional CTA when the click would immediately assign', () => {
    render(<MatchingBookCard book={{ ...book, conditionalWouldAssign: true }} {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Готов:а читать' })).not.toBeInTheDocument()
  })

  it('keeps the conditional CTA when the click stays tentative', () => {
    render(<MatchingBookCard book={{ ...book, conditionalWouldAssign: false }} {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Готов:а читать' })).toBeInTheDocument()
  })

  it('shows admin controls without repeating participant-action copy', () => {
    const { container } = render(
      <MatchingBookCard book={book} {...baseProps} adminMode adminControls={<button>Управлять составом</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Управлять составом' })).toBeInTheDocument()
    expect(screen.queryByText('Административный режим — выбор участника недоступен')).not.toBeInTheDocument()
    expect(container.querySelector('.nd-mb-actions')).not.toBeInTheDocument()
  })

  it('labels a formed book the viewer has not joined with the circle-found kicker', () => {
    render(<MatchingBookCard book={{ ...book, formedAt: '2026-07-14T08:00:00Z', allowedActions: { conditional: false, hard: true, cancelHard: false } }} {...baseProps} />)
    expect(screen.getByText('○ круг найден')).toBeInTheDocument()
    expect(screen.getByText('Круг уже найден, но можно присоединиться')).toBeInTheDocument()
  })

  it('labels the viewer own circle', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'assigned', formedAt: '2026-07-13T10:00:00Z' }} {...baseProps} viewerAssignmentBookId="b1" />)
    expect(screen.getByText('◆ ваш круг')).toBeInTheDocument()
  })

  it('shows unplaced participants only after the book has formed', () => {
    const assignedBook = {
      ...book,
      participants: [...book.participants, { ref: 'viewer', displayName: 'Евгений', status: 'assigned' as const, rank: 1 }],
      unplacedParticipantRefs: ['viewer'],
    }
    const { rerender } = render(<MatchingBookCard book={assignedBook} {...baseProps} />)
    expect(screen.queryByText('Без круга: Евгений')).not.toBeInTheDocument()

    rerender(<MatchingBookCard book={{ ...assignedBook, formedAt: '2026-07-14T08:00:00Z' }} {...baseProps} />)
    expect(screen.getByText('Без круга: Евгений')).toBeInTheDocument()
  })

  it('keeps the hard action available while a hard elsewhere disables the conditional CTA', () => {
    render(<MatchingBookCard book={book} {...baseProps} viewerHardBookId="b2" />)
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готов:а читать' })).toBeDisabled()
    expect(screen.queryByText(/новый окончательный выбор заменит предыдущий/i)).not.toBeInTheDocument()
  })

  it('emits a hard command from the initiating button', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(baseProps.onCommand).toHaveBeenCalledWith('setHard', 'b1', expect.any(HTMLButtonElement))
  })

  it('renders an assigned card without technical slot copy', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'assigned', formedAt: '2026-07-13T10:00:00Z' }} {...baseProps} viewerAssignmentBookId="b1" />)
    expect(screen.queryByText(/слот занят/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Записаться' })).not.toBeInTheDocument()
  })
})

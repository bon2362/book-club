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
  viewerRef: 'viewer', viewerHasHard: false,
  readOnly: false, pendingAction: null, onCommand: jest.fn(), onOpenBook: jest.fn(),
}

const AUTO_CARET = 'Автоматическая запись, если соберётся круг'
const AUTO_OPTION = 'Запишите меня автоматически, если соберётся круг'

describe('MatchingBookCard', () => {
  beforeEach(() => { baseProps.onCommand.mockClear(); baseProps.onOpenBook.mockClear() })

  it('renders the three mutually-exclusive aggregate groups as buttons', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    expect(screen.getByRole('button', { name: '1 уже записал:ась' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 готов:а читать' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ещё у 1 эта книга в списке' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    // The soft option now lives behind the record button's caret, not a separate CTA.
    expect(screen.getByRole('button', { name: AUTO_CARET })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Готов:а читать' })).not.toBeInTheDocument()
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

  it('opens the auto-enroll menu and toggles the soft intent from a checkbox', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: AUTO_CARET }))
    const option = screen.getByRole('menuitemcheckbox', { name: AUTO_OPTION })
    expect(option).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(option)
    expect(baseProps.onCommand).toHaveBeenCalledWith('setConditional', 'b1', expect.any(HTMLButtonElement))
  })

  it('reflects an active auto-enroll and unsets it from the menu', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'conditional' }} {...baseProps} />)
    expect(screen.getByText('Авто-запись включена')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: AUTO_CARET }))
    const option = screen.getByRole('menuitemcheckbox', { name: AUTO_OPTION })
    expect(option).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(option)
    expect(baseProps.onCommand).toHaveBeenCalledWith('unsetConditional', 'b1', expect.any(HTMLButtonElement))
  })

  it('drops the caret entirely when the soft click would immediately assign', () => {
    render(<MatchingBookCard book={{ ...book, conditionalWouldAssign: true }} {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: AUTO_CARET })).not.toBeInTheDocument()
  })

  it('keeps the caret when the soft click stays tentative', () => {
    render(<MatchingBookCard book={{ ...book, conditionalWouldAssign: false }} {...baseProps} />)
    expect(screen.getByRole('button', { name: AUTO_CARET })).toBeInTheDocument()
  })

  it('disables the auto-enroll option when the viewer has any hard choice', () => {
    render(<MatchingBookCard book={book} {...baseProps} viewerHasHard />)
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: AUTO_CARET }))
    expect(screen.getByRole('menuitemcheckbox', { name: AUTO_OPTION })).toBeDisabled()
    expect(screen.getByText('Авто-запись недоступна после окончательной записи.')).toBeInTheDocument()
  })

  it('uses the fixed formation threshold in the waiting note', () => {
    const hardBook = { ...book, viewerStatus: 'hard' as const, allowedActions: { conditional: false, hard: false, cancelHard: true } }
    render(<MatchingBookCard book={hardBook} {...baseProps} />)
    expect(screen.getByText('Ждём остальных. Книга сформируется при 2 окончательных записях и 3 участниках всего. Круги — по 3–5 человек.')).toBeInTheDocument()
  })

  it('shows admin controls without repeating participant-action copy', () => {
    const { container } = render(
      <MatchingBookCard book={book} {...baseProps} adminMode adminControls={<button>Управлять составом</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Управлять составом' })).toBeInTheDocument()
    expect(screen.queryByText('Административный режим — выбор участника недоступен')).not.toBeInTheDocument()
    expect(container.querySelector('.nd-mb-actions')).not.toBeInTheDocument()
  })

  it('labels a formed book the viewer has not joined with the circle-assembled kicker', () => {
    render(<MatchingBookCard book={{ ...book, formedAt: '2026-07-14T08:00:00Z', allowedActions: { conditional: false, hard: true, cancelHard: false } }} {...baseProps} />)
    expect(screen.getByText('○ Круг собрался')).toBeInTheDocument()
    expect(screen.getByText('Круг уже собран, но можно присоединиться')).toBeInTheDocument()
  })

  it('labels the viewer own circle with the filled circle kicker', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'assigned', formedAt: '2026-07-13T10:00:00Z' }} {...baseProps} />)
    expect(screen.getByText('● Ваш круг')).toBeInTheDocument()
  })

  it('shows unplaced participants to the organiser only after the book has formed', () => {
    const assignedBook = {
      ...book,
      participants: [...book.participants, { ref: 'viewer', displayName: 'Евгений', status: 'assigned' as const, rank: 1 }],
      unplacedParticipantRefs: ['viewer'],
    }
    const { rerender } = render(<MatchingBookCard book={assignedBook} {...baseProps} adminMode />)
    expect(screen.queryByText('Без круга: Евгений')).not.toBeInTheDocument()

    rerender(<MatchingBookCard book={{ ...assignedBook, formedAt: '2026-07-14T08:00:00Z' }} {...baseProps} adminMode />)
    expect(screen.getByText('Без круга: Евгений')).toBeInTheDocument()
  })

  // Composition diagnostics are organiser-only: a participant cannot place anyone into a
  // circle, so both the warning and its orange accent would be alarm without a remedy.
  it('hides composition diagnostics from participants', () => {
    const brokenBook = {
      ...book,
      formedAt: '2026-07-14T08:00:00Z',
      currentViability: 'needs_attention' as const,
      participants: [...book.participants, { ref: 'viewer', displayName: 'Евгений', status: 'assigned' as const, rank: 1 }],
      unplacedParticipantRefs: ['viewer'],
    }
    const { container, rerender } = render(<MatchingBookCard book={brokenBook} {...baseProps} />)
    expect(screen.queryByText('Состав требует корректировки')).not.toBeInTheDocument()
    expect(screen.queryByText('Без круга: Евгений')).not.toBeInTheDocument()
    expect(container.querySelector('.needs-attention')).not.toBeInTheDocument()

    rerender(<MatchingBookCard book={brokenBook} {...baseProps} adminMode />)
    expect(screen.getByText('Состав требует корректировки')).toBeInTheDocument()
    expect(screen.getByText('Без круга: Евгений')).toBeInTheDocument()
    expect(container.querySelector('.needs-attention')).toBeInTheDocument()
  })

  it('emits a hard command from the initiating button', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(baseProps.onCommand).toHaveBeenCalledWith('setHard', 'b1', expect.any(HTMLButtonElement))
  })

  it('renders an assigned card without technical slot copy', () => {
    render(<MatchingBookCard book={{ ...book, viewerStatus: 'assigned', formedAt: '2026-07-13T10:00:00Z' }} {...baseProps} />)
    expect(screen.queryByText(/слот занят/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Записаться' })).not.toBeInTheDocument()
  })

  it('keeps other books actionable after an assignment', () => {
    render(<MatchingBookCard book={book} {...baseProps} />)
    const card = screen.getByTestId('matching-book-card-b1')
    expect(card).not.toHaveClass('is-dim')
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument()
  })
})

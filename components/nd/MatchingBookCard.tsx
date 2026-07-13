'use client'

import CoverImage from './CoverImage'
import MatchingBookParticipants from './MatchingBookParticipants'
import MatchingBookCircles from './MatchingBookCircles'
import type { MatchingBookView } from './matching-book-types'

export type MatchingBookCommandAction =
  | 'setConditional'
  | 'unsetConditional'
  | 'setHard'
  | 'cancelHard'

interface Props {
  book: MatchingBookView
  viewerRef: string
  viewerAssignmentBookId: string | null
  viewerHardBookId: string | null
  readOnly: boolean
  adminMode?: boolean
  controlsDisabled?: boolean
  pendingAction: MatchingBookCommandAction | null
  onCommand: (action: MatchingBookCommandAction, bookId: string, control: HTMLButtonElement) => void
  onOpenBook: (book: MatchingBookView, control: HTMLButtonElement) => void
  adminControls?: React.ReactNode
}

function peopleText(book: MatchingBookView, viewerRef: string) {
  const final = book.participants.filter((participant) => participant.status === 'hard' || participant.status === 'assigned').length
  const conditional = book.participants.filter((participant) => participant.status === 'conditional').length
  const interested = book.participants.filter((participant) => participant.status === 'interest' && participant.ref !== viewerRef).length
  if (final === 0 && conditional === 0 && interested === 0) return 'Пока только у вас в списке'
  return [
    final > 0 ? `${final} уже записал${final === 1 ? 'ся' : 'ись'}` : '',
    conditional > 0 ? `${conditional} готов${conditional === 1 ? '' : 'ы'} читать` : '',
    interested > 0 ? `ещё ${interested} держ${interested === 1 ? 'ит' : 'ат'} в списке` : '',
  ].filter(Boolean).join(' · ')
}

export default function MatchingBookCard({
  book,
  viewerRef,
  viewerAssignmentBookId,
  viewerHardBookId,
  readOnly,
  adminMode = false,
  controlsDisabled = false,
  pendingAction,
  onCommand,
  onOpenBook,
  adminControls,
}: Props) {
  const assignedHere = book.viewerStatus === 'assigned'
  const hardHere = book.viewerStatus === 'hard'
  const conditionalHere = book.viewerStatus === 'conditional'
  const lockedElsewhere = viewerAssignmentBookId !== null && viewerAssignmentBookId !== book.bookId
  const hasHardElsewhere = viewerHardBookId !== null && viewerHardBookId !== book.bookId
  const formed = book.formedAt !== null
  const pending = pendingAction !== null
  const className = [
    'nd-mb-card',
    assignedHere ? 'is-assigned' : '',
    hardHere ? 'is-hard' : '',
    formed ? 'is-formed' : '',
    book.currentViability === 'needs_attention' ? 'needs-attention' : '',
    book.intersectionCount === 0 ? 'has-no-overlap' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={className} data-testid={`matching-book-card-${book.bookId}`}>
      <div className="nd-mb-head">
        <button
          type="button"
          className="nd-mb-cover"
          aria-label={`Открыть книгу «${book.title}»`}
          onClick={(event) => onOpenBook(book, event.currentTarget)}
        >
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </button>
        <div className="nd-mb-titles">
          {assignedHere && <div className="nd-mb-kicker is-assigned">◆ ваш круг</div>}
          {!assignedHere && formed && <div className="nd-mb-kicker is-formed">◆ группа собиралась</div>}
          <button type="button" className="nd-mb-title" onClick={(event) => onOpenBook(book, event.currentTarget)}>
            {book.title}
          </button>
          <div className="nd-mb-author">{book.author}</div>
          {!formed && <div className="nd-mb-meta">{peopleText(book, viewerRef)}</div>}
          {formed && book.currentViability === 'needs_attention' && (
            <div className="nd-mb-viability">Состав требует корректировки</div>
          )}
        </div>
      </div>

      {!formed && <MatchingBookParticipants participants={book.participants} />}
      {formed && (
        <MatchingBookCircles circles={book.circles} participants={book.participants} viewerRef={viewerRef} />
      )}
      {book.unplacedParticipantRefs.length > 0 && (
        <p className="nd-mb-unplaced">
          Без круга: {book.unplacedParticipantRefs.map((ref) => book.participants.find((p) => p.ref === ref)?.displayName ?? ref).join(', ')}
        </p>
      )}

      <div className="nd-mb-actions" aria-busy={pending || controlsDisabled}>
        {adminMode ? (
          <span>Административный режим — выбор участника недоступен</span>
        ) : assignedHere ? (
          <><strong className="nd-mb-assigned-copy">✓ Вы назначены на эту книгу</strong><span>Слот занят — изменить может только организатор</span></>
        ) : lockedElsewhere ? (
          <span>Ваш слот занят другой книгой — здесь только просмотр</span>
        ) : hardHere ? (
          <>
            <strong className="nd-mb-hard-copy">✓ Вы записаны</strong>
            {!readOnly && book.allowedActions.cancelHard && (
              <button type="button" className="nd-mb-btn is-ghost" disabled={pending || controlsDisabled} onClick={(event) => onCommand('cancelHard', book.bookId, event.currentTarget)}>
                {pendingAction === 'cancelHard' ? 'Отменяем…' : 'Отменить'}
              </button>
            )}
          </>
        ) : readOnly ? (
          <span>Сессия закрыта — выбор доступен только для просмотра</span>
        ) : (
          <>
            {book.allowedActions.hard && (
              <button type="button" className="nd-mb-btn is-hard" disabled={pending || controlsDisabled} onClick={(event) => onCommand('setHard', book.bookId, event.currentTarget)}>
                {pendingAction === 'setHard' ? 'Записываем…' : hasHardElsewhere ? 'Записаться сюда' : 'Записать'}
              </button>
            )}
            {!formed && book.allowedActions.conditional && (
              <button
                type="button"
                className={`nd-mb-btn is-conditional${conditionalHere ? ' is-active' : ''}`}
                disabled={pending || controlsDisabled || hasHardElsewhere}
                aria-pressed={conditionalHere}
                onClick={(event) => onCommand(conditionalHere ? 'unsetConditional' : 'setConditional', book.bookId, event.currentTarget)}
              >
                {pendingAction === 'setConditional' || pendingAction === 'unsetConditional' ? 'Сохраняем…' : conditionalHere ? '✓ Готов читать' : 'Готов читать'}
              </button>
            )}
            {formed && book.allowedActions.hard && <span>Книга уже собиралась — можно присоединиться</span>}
          </>
        )}
      </div>
      {adminControls}
    </article>
  )
}

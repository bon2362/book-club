'use client'

import CoverImage from './CoverImage'
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

function usesSingularForm(count: number) {
  return count % 10 === 1 && count % 100 !== 11
}

function enrolledText(count: number) {
  return `${count} уже записал${usesSingularForm(count) ? 'ся' : 'ись'}`
}

function addedText(count: number) {
  return `ещё ${count} добавил${usesSingularForm(count) ? '' : 'и'} эту книгу`
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
  const finalCount = book.participants.filter((participant) => participant.status === 'hard' || participant.status === 'assigned').length
  const conditionalCount = book.participants.filter((participant) => participant.status === 'conditional').length
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
          {!assignedHere && formed && <div className="nd-mb-kicker is-formed">◆ группа собрана</div>}
          <button type="button" className="nd-mb-title" onClick={(event) => onOpenBook(book, event.currentTarget)}>
            {book.title}
          </button>
          <div className="nd-mb-author">{book.author}</div>
          {!formed && (
            <div className="nd-mb-meta">
              {finalCount > 0 && <span className="nd-mb-enrolled"><span aria-hidden="true" />{enrolledText(finalCount)}</span>}
              {book.intersectionCount > 0 && <span className="nd-mb-added">{addedText(book.intersectionCount)}</span>}
              {finalCount === 0 && book.intersectionCount === 0 && <span className="nd-mb-added">Пока только у вас в списке</span>}
            </div>
          )}
          {formed && book.currentViability === 'needs_attention' && (
            <div className="nd-mb-viability">Состав требует корректировки</div>
          )}
        </div>
      </div>

      {formed && (
        <MatchingBookCircles circles={book.circles} participants={book.participants} viewerRef={viewerRef} />
      )}
      {book.unplacedParticipantRefs.length > 0 && (
        <p className="nd-mb-unplaced">
          Без круга: {book.unplacedParticipantRefs.map((ref) => book.participants.find((p) => p.ref === ref)?.displayName ?? ref).join(', ')}
        </p>
      )}

      {!adminMode && <div className="nd-mb-actions" aria-busy={pending || controlsDisabled}>
        {assignedHere ? (
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
                {pendingAction === 'setConditional' || pendingAction === 'unsetConditional'
                  ? 'Сохраняем…'
                  : `${conditionalHere ? '✓ ' : ''}Готов читать${conditionalCount > 0 ? ` · ${conditionalCount}` : ''}`}
              </button>
            )}
            {formed && book.allowedActions.hard && <span>Книга уже собрана, но можно присоединиться</span>}
          </>
        )}
      </div>}
      {adminControls}
    </article>
  )
}

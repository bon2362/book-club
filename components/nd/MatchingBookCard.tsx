'use client'

import { useEffect, useRef, useState } from 'react'
import CoverImage from './CoverImage'
import MatchingBookCircles from './MatchingBookCircles'
import type { MatchingBookView } from './matching-book-types'
import {
  MAX_CIRCLE_SIZE,
  MIN_CIRCLE_SIZE,
  MIN_FORMATION_HARD_CHOICES,
  MIN_FORMATION_TOTAL_CHOICES,
} from '@/lib/matching/book-partition'

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
  switchFromBookTitle?: string | null
  onConfirmSwitch?: (control: HTMLButtonElement) => void
  onCancelSwitch?: () => void
  onCommand: (action: MatchingBookCommandAction, bookId: string, control: HTMLButtonElement) => void
  onOpenBook: (book: MatchingBookView, control: HTMLButtonElement) => void
  adminControls?: React.ReactNode
}

function usesSingularForm(count: number) {
  return count % 10 === 1 && count % 100 !== 11
}

function enrolledText(count: number) {
  return `${count} уже записал${usesSingularForm(count) ? ':ась' : 'ись'}`
}

function conditionalText(count: number) {
  return `${count} готов${usesSingularForm(count) ? ':а' : 'ы'} читать`
}

function interestText(count: number) {
  return `ещё у ${count} эта книга в списке`
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
  switchFromBookTitle = null,
  onConfirmSwitch,
  onCancelSwitch,
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
  // Three mutually-exclusive aggregate groups; the interest group excludes the viewer.
  const enrolledCount = book.participants.filter((participant) => participant.status === 'hard' || participant.status === 'assigned').length
  const conditionalCount = book.participants.filter((participant) => participant.status === 'conditional').length
  const interestCount = book.participants.filter((participant) => participant.status === 'interest' && participant.ref !== viewerRef).length
  const conditionalWouldAssign = book.conditionalWouldAssign ?? false
  const pending = pendingAction !== null
  // Auto-enroll (the soft "conditional") lives behind the record button's caret.
  const showAuto = !formed && book.allowedActions.conditional && !conditionalWouldAssign
  const [autoMenuOpen, setAutoMenuOpen] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!autoMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (splitRef.current && !splitRef.current.contains(event.target as Node)) setAutoMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAutoMenuOpen(false)
        caretRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [autoMenuOpen])

  const className = [
    'nd-mb-card',
    assignedHere ? 'is-assigned' : '',
    hardHere ? 'is-hard' : '',
    formed ? 'is-formed' : '',
    lockedElsewhere ? 'is-dim' : '',
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
          {assignedHere && <div className="nd-mb-kicker is-assigned">● Ваш круг</div>}
          {!assignedHere && formed && <div className="nd-mb-kicker is-formed">○ Круг собрался</div>}
          <button type="button" className="nd-mb-title" onClick={(event) => onOpenBook(book, event.currentTarget)}>
            {book.title}
          </button>
          <div className="nd-mb-author">{book.author}</div>
          {!formed && (
            <div className="nd-mb-metrics">
              {enrolledCount > 0 && (
                <button type="button" className="nd-mb-metric is-enrolled" onClick={(event) => onOpenBook(book, event.currentTarget)}>
                  {enrolledText(enrolledCount)}
                </button>
              )}
              {conditionalCount > 0 && (
                <button type="button" className="nd-mb-metric is-conditional" onClick={(event) => onOpenBook(book, event.currentTarget)}>
                  {conditionalText(conditionalCount)}
                </button>
              )}
              {interestCount > 0 && (
                <button type="button" className="nd-mb-metric" onClick={(event) => onOpenBook(book, event.currentTarget)}>
                  {interestText(interestCount)}
                </button>
              )}
              {enrolledCount === 0 && conditionalCount === 0 && interestCount === 0 && (
                <span className="nd-mb-metric-empty">Пока только у вас в списке</span>
              )}
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
      {formed && book.unplacedParticipantRefs.length > 0 && (
        <p className="nd-mb-unplaced">
          Без круга: {book.unplacedParticipantRefs.map((ref) => book.participants.find((p) => p.ref === ref)?.displayName ?? ref).join(', ')}
        </p>
      )}

      {!adminMode && <div className="nd-mb-actions" aria-busy={pending || controlsDisabled}>
        {switchFromBookTitle && onConfirmSwitch && onCancelSwitch ? (
          <div className="nd-mb-switch-confirm" role="group" aria-label="Подтверждение смены книги">
            <span>Если записаться на «{book.title}», выбор «{switchFromBookTitle}» будет снят.</span>
            <div>
              <button type="button" className="nd-mb-btn is-hard" data-testid="matching-hard-switch-confirm" disabled={controlsDisabled} onClick={(event) => onConfirmSwitch(event.currentTarget)}>Перезаписаться</button>
              <button type="button" className="nd-mb-btn is-ghost" disabled={controlsDisabled} onClick={onCancelSwitch}>Оставить как есть</button>
            </div>
          </div>
        ) : hardHere ? (
          <>
            <strong className="nd-mb-hard-copy">✓ Вы записаны</strong>
            {!readOnly && book.allowedActions.cancelHard && (
              <button type="button" className="nd-mb-btn is-ghost" disabled={pending || controlsDisabled} onClick={(event) => onCommand('cancelHard', book.bookId, event.currentTarget)}>
                {pendingAction === 'cancelHard' ? 'Отменяем…' : 'Отменить'}
              </button>
            )}
            <span className="nd-mb-action-note">{`Ждём остальных. Книга сформируется при ${MIN_FORMATION_HARD_CHOICES} окончательных записях и ${MIN_FORMATION_TOTAL_CHOICES} участниках всего. Круги — по ${MIN_CIRCLE_SIZE}–${MAX_CIRCLE_SIZE} человек.`}</span>
          </>
        ) : assignedHere || lockedElsewhere ? null
        : readOnly ? (
          <span>Сессия закрыта — выбор доступен только для просмотра</span>
        ) : (
          <>
            {book.allowedActions.hard && (showAuto ? (
              <div className="nd-mb-split" ref={splitRef}>
                <div className="nd-mb-split-bar">
                  <button
                    type="button"
                    className="nd-mb-btn is-hard nd-mb-split-main"
                    disabled={pending || controlsDisabled}
                    onClick={(event) => onCommand('setHard', book.bookId, event.currentTarget)}
                  >
                    {pendingAction === 'setHard' ? 'Записываем…' : 'Записаться'}
                  </button>
                  <button
                    type="button"
                    ref={caretRef}
                    className="nd-mb-btn is-hard nd-mb-split-caret"
                    aria-haspopup="menu"
                    aria-expanded={autoMenuOpen}
                    aria-label="Автоматическая запись, если соберётся круг"
                    disabled={pending || controlsDisabled}
                    onClick={() => setAutoMenuOpen((open) => !open)}
                  >
                    ▾
                  </button>
                </div>
                {autoMenuOpen && (
                  <div className="nd-mb-split-menu" role="menu">
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={conditionalHere}
                      className="nd-mb-split-opt"
                      disabled={pending || controlsDisabled || hasHardElsewhere}
                      onClick={(event) => onCommand(conditionalHere ? 'unsetConditional' : 'setConditional', book.bookId, event.currentTarget)}
                    >
                      <span className={`nd-mb-check${conditionalHere ? ' is-on' : ''}`} aria-hidden="true">{conditionalHere ? '✓' : ''}</span>
                      <span>
                        {pendingAction === 'setConditional' || pendingAction === 'unsetConditional'
                          ? 'Сохраняем…'
                          : 'Запишите меня автоматически, если соберётся круг'}
                      </span>
                    </button>
                    <p className="nd-mb-split-hint">
                      {hasHardElsewhere
                        ? 'Сначала отмените запись на другой книге.'
                        : 'Можно отметить несколько книг — запишем в первую, где соберётся круг.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="nd-mb-btn is-hard"
                disabled={pending || controlsDisabled}
                onClick={(event) => onCommand('setHard', book.bookId, event.currentTarget)}
              >
                {pendingAction === 'setHard' ? 'Записываем…' : 'Записаться'}
              </button>
            ))}
            {showAuto && conditionalHere && <span className="nd-mb-auto-note">Авто-запись включена</span>}
            {formed && book.allowedActions.hard && <span>Круг уже собран, но можно присоединиться</span>}
          </>
        )}
      </div>}
      {adminControls}
    </article>
  )
}

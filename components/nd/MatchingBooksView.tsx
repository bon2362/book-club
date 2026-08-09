'use client'

import { useRef, useState } from 'react'
import { useBookDetail } from './BookDetailProvider'
import MatchingBookCard, { type MatchingBookCommandAction } from './MatchingBookCard'
import MatchingBookAdminControls, { type MatchingBookAdminAction, type MatchingBookAdminCommand } from './MatchingBookAdminControls'
import type { MatchingBookDetail } from './MatchingBookDetailModal'
import {
  matchingBookDetail,
  type MatchingBookModeState,
} from './matching-book-types'
import {
  MAX_CIRCLE_SIZE,
  MIN_CIRCLE_SIZE,
  MIN_FORMATION_HARD_CHOICES,
  MIN_FORMATION_TOTAL_CHOICES,
} from '@/lib/matching/book-partition'

interface Props {
  sessionId: string
  stateVersion: number
  sessionStatus: string
  viewerRef: string
  bookMode: MatchingBookModeState
  booksById: Record<string, MatchingBookDetail>
  isAdmin: boolean
  mutationUserId?: string
  onState: (state: unknown) => void
  onRefresh: () => Promise<void>
}

type PendingCommand = { bookId: string; action: MatchingBookCommandAction | MatchingBookAdminAction } | null

export default function MatchingBooksView({
  sessionId,
  stateVersion,
  sessionStatus,
  viewerRef,
  bookMode,
  booksById,
  isAdmin,
  mutationUserId,
  onState,
  onRefresh,
}: Props) {
  const { openBook } = useBookDetail()
  const [pending, setPending] = useState<PendingCommand>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [instructionsExpanded, setInstructionsExpanded] = useState(false)
  const focusRef = useRef<{ bookId: string; element: HTMLButtonElement } | null>(null)
  const viewerHasHard = bookMode.books.some((book) => book.viewerStatus === 'hard')
  const selectedBooks = bookMode.viewerAssignmentBookIds
    .map((bookId) => booksById[bookId] ?? bookMode.books.find((book) => book.bookId === bookId))
    .filter((book): book is NonNullable<typeof book> => Boolean(book))
  const mutationsAvailable = bookMode.mutationsAvailable !== false
  const readOnly = sessionStatus === 'closed' || !mutationsAvailable
  // The read model owns canonical sorting (including catalog-order tie breaking).
  const books = bookMode.books

  async function performCommand(action: MatchingBookCommandAction, bookId: string, control: HTMLButtonElement) {
    if (pending) return
    focusRef.current = { bookId, element: control }
    setPending({ action, bookId })
    setMessage(null)
    try {
      const impersonationQuery = mutationUserId ? `?as=${encodeURIComponent(mutationUserId)}` : ''
      const response = await fetch(`/api/matching/sessions/${sessionId}/book-actions${impersonationQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, bookId, expectedStateVersion: stateVersion }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string; state?: unknown }
      if (response.status === 409 && body.state) {
        onState(body.state)
        setMessage('Сессия изменилась. Данные обновлены — повторите действие.')
        return
      }
      if (!response.ok) throw new Error(bookActionErrorMessage(body.error))
      if (body.state) onState(body.state)
      else await onRefresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Не удалось изменить выбор')
    } finally {
      setPending(null)
      requestAnimationFrame(() => {
        const previous = focusRef.current
        if (!previous) return
        if (previous.element.isConnected) previous.element.focus()
        else document.querySelector<HTMLElement>(`[data-testid="matching-book-card-${CSS.escape(previous.bookId)}"] button`)?.focus()
      })
    }
  }

  function command(action: MatchingBookCommandAction, bookId: string, control: HTMLButtonElement) {
    void performCommand(action, bookId, control)
  }

  async function adminCommand(bookId: string, command: MatchingBookAdminCommand) {
    if (pending) return
    setPending({ action: command.action, bookId })
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...command,
          bookId,
          userId: command.participant?.adminUserId,
          participantRef: command.participant?.ref,
          participant: undefined,
          expectedStateVersion: stateVersion,
        }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string; state?: unknown }
      if (response.status === 409 && body.state) {
        onState(body.state)
        setMessage('Сессия изменилась. Данные обновлены — повторите действие.')
        return
      }
      if (!response.ok) throw new Error(body.error ?? 'Не удалось изменить состав')
      if (body.state) onState(body.state)
      else await onRefresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Не удалось изменить состав')
    } finally {
      setPending(null)
    }
  }

  if (books.length === 0) {
    return <div className="nd-mb-empty" data-testid="matching-books-empty">В вашем списке пока нет книг для матчинга.</div>
  }

  return (
    <div className="nd-mb-view" data-testid="matching-books-view" aria-busy={pending !== null}>
      <header className="nd-mb-intro">
        <h2>{isAdmin ? 'Книги сессии' : 'Совпадения по вашим книгам'}</h2>
        {isAdmin ? (
          <p>Здесь можно увидеть и скорректировать актуальные договорённости участников.</p>
        ) : (
          <div className="nd-mb-intro-disclosure">
            <div className="nd-mb-intro-summary">
              <span>Выбирайте все книги, которые будете читать</span>
              <button
                type="button"
                className="p-link muted"
                aria-expanded={instructionsExpanded}
                aria-controls="matching-book-instructions"
                onClick={() => setInstructionsExpanded(value => !value)}
              >
                {instructionsExpanded ? 'Короче' : 'Подробнее'}
              </button>
            </div>
            {instructionsExpanded && (
              <ul
                id="matching-book-instructions"
                className="nd-mb-intro-details"
                aria-label="Как выбрать книгу"
              >
                <li>Выберите все книги, которые будете читать</li>
                <li>Книги отсортированы по степени интереса участни:ц, добавивших их в свои списки</li>
                <li>Нажмите на имя участни:цы, чтобы узнать, на какое место он:а поместила книгу</li>
                <li>{`В меню кнопки «Записаться ▾» можно включить авто-запись сразу на нескольких книгах — она действует, пока вы не запишетесь окончательно; книга сформируется при ${MIN_FORMATION_HARD_CHOICES} окончательных записях и ${MIN_FORMATION_TOTAL_CHOICES} участниках всего; круги — по ${MIN_CIRCLE_SIZE}–${MAX_CIRCLE_SIZE} человек`}</li>
                <li>Можно читать несколько книг одновременно</li>
                <li>Разные группы могут читать одну и ту же книгу</li>
              </ul>
            )}
          </div>
        )}
        {readOnly && (!isAdmin || !mutationsAvailable) && (
          <div className="nd-mb-slot" data-testid="matching-books-readonly">
            {!mutationsAvailable
              ? 'Матчинг временно недоступен — обновление базы данных ещё не завершено'
              : 'Сессия закрыта — выбор доступен только для просмотра'}
          </div>
        )}
      </header>
      {selectedBooks.length > 0 && !isAdmin && (
        <div className="nd-mb-selection" data-testid="matching-books-selection">
          <span>Вы записаны на <strong>{selectedBooks.map((book) => book.title).join(', ')}</strong></span>
        </div>
      )}
      {message && <div className="nd-mb-message" data-testid="matching-books-message" aria-live="polite">{message}</div>}
      <div className="nd-mb-list">
        {books.map((book, index) => {
          const viewerOnlyTail = !isAdmin && book.intersectionCount === 0 && book.formedAt === null &&
            !bookMode.viewerAssignmentBookIds.includes(book.bookId) && book.viewerStatus !== 'hard'
          const previous = books[index - 1]
          const previousIsTail = previous && previous.intersectionCount === 0 && previous.formedAt === null &&
            !bookMode.viewerAssignmentBookIds.includes(previous.bookId) && previous.viewerStatus !== 'hard'
          return <div className="nd-mb-list-item" key={book.bookId}>
            {viewerOnlyTail && !previousIsTail && (
              <div className="nd-mb-divider" data-testid="matching-viewer-only-divider">Только в вашем списке</div>
            )}
            <MatchingBookCard
              book={book}
              viewerRef={viewerRef}
              viewerHasHard={viewerHasHard}
              readOnly={readOnly}
              adminMode={isAdmin}
              controlsDisabled={pending !== null}
              pendingAction={pending?.bookId === book.bookId && ['setConditional', 'unsetConditional', 'setHard', 'cancelHard'].includes(pending.action) ? pending.action as MatchingBookCommandAction : null}
              onCommand={command}
              onOpenBook={(selected, control) => {
                focusRef.current = { bookId: selected.bookId, element: control }
                openBook(matchingBookDetail(selected, booksById[selected.bookId]), [], selected.participants)
              }}
              adminControls={isAdmin && mutationsAvailable ? (
                <MatchingBookAdminControls
                  book={book}
                  adminParticipants={bookMode.adminParticipants ?? []}
                  pending={pending !== null}
                  onAction={(command) => adminCommand(book.bookId, command)}
                />
              ) : undefined}
            />
          </div>
        })}
      </div>
    </div>
  )
}

function bookActionErrorMessage(code?: string) {
  switch (code) {
    case 'participant_locked':
      return 'Вы уже назначены в сформированный круг. Изменить выбор может только организатор.'
    case 'book_not_in_shortlist':
      return 'Этой книги больше нет в вашем списке. Обновите страницу и выберите другую.'
    case 'session_closed':
    case 'book_action_forbidden':
      return 'Сейчас изменить выбор нельзя. Обновите страницу, чтобы увидеть актуальное состояние.'
    case 'participant_missing':
      return 'Вы больше не участвуете в этой сессии.'
    case 'matching_migration_required':
      return 'Матчинг временно недоступен — обновление базы данных ещё не завершено.'
    default:
      return 'Не удалось изменить выбор. Обновите страницу и попробуйте снова.'
  }
}

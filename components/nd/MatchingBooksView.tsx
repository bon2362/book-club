'use client'

import { useRef, useState } from 'react'
import { useBookDetail } from './BookDetailProvider'
import MatchingBookCard, { type MatchingBookCommandAction } from './MatchingBookCard'
import MatchingBookAdminControls, { type MatchingBookAdminAction, type MatchingBookAdminCommand } from './MatchingBookAdminControls'
import MatchingInstructions from './MatchingInstructions'
import type { MatchingBookDetail } from './MatchingBookDetailModal'
import {
  matchingBookDetail,
  isTailBook,
  type MatchingBookModeState,
} from './matching-book-types'
import { DEFAULT_MATCHING_INSTRUCTIONS, type MatchingInstructions as MatchingInstructionsData } from '@/lib/matching/instructions-content'

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
  instructions?: MatchingInstructionsData
}

type PendingCommand = { bookId: string; action: MatchingBookCommandAction | MatchingBookAdminAction | 'returnToMatching' } | null

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
  instructions = DEFAULT_MATCHING_INSTRUCTIONS,
}: Props) {
  const { openBook } = useBookDetail()
  const [pending, setPending] = useState<PendingCommand>(null)
  const [message, setMessage] = useState<string | null>(null)
  const focusRef = useRef<{ bookId: string; element: HTMLButtonElement } | null>(null)
  const viewerHasHard = bookMode.books.some((book) => book.viewerStatus === 'hard')
  const selectedBooks = bookMode.viewerAssignmentBookIds
    .map((bookId) => booksById[bookId] ?? bookMode.books.find((book) => book.bookId === bookId))
    .filter((book): book is NonNullable<typeof book> => Boolean(book))
  const mutationsAvailable = bookMode.mutationsAvailable !== false
  const viewerCompleted = bookMode.viewerCompleted === true
  const readOnly = sessionStatus === 'closed' || !mutationsAvailable || viewerCompleted
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

  async function returnToMatching(bookId: string, control: HTMLButtonElement) {
    if (pending) return
    focusRef.current = { bookId, element: control }
    setPending({ action: 'returnToMatching', bookId })
    setMessage(null)
    try {
      const response = await fetch(`/api/signup-books/${bookId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: null }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Не удалось вернуть книгу в подбор')
      await onRefresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Не удалось вернуть книгу в подбор')
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
        {isAdmin ? <h2>Книги сессии</h2> : <MatchingInstructions instructions={instructions} />}
        {isAdmin ? (
          <p>Здесь можно увидеть и скорректировать актуальные договорённости участников.</p>
        ) : null}
        {readOnly && (!isAdmin || !mutationsAvailable) && (
          <div className="nd-mb-slot" data-testid="matching-books-readonly">
            {viewerCompleted
              ? 'Ваш подбор завершён: остальные книги доступны только для просмотра'
              : !mutationsAvailable
              ? 'Матчинг временно недоступен — обновление базы данных ещё не завершено'
              : 'Сессия закрыта — выбор доступен только для просмотра'}
          </div>
        )}
      </header>
      {selectedBooks.length > 0 && !isAdmin && (
        <div className="nd-mb-selection" data-testid="matching-books-selection">
          <span>{viewerCompleted ? 'Вы читаете ' : 'Вы записаны на '}<strong>{selectedBooks.map((book) => book.title).join(', ')}</strong></span>
        </div>
      )}
      {message && <div className="nd-mb-message" data-testid="matching-books-message" aria-live="polite">{message}</div>}
      <div className="nd-mb-list">
        {books.map((book, index) => {
          // A completed participant cannot act on anything, so the "can't sign up yet"
          // divider would only repeat the banner above — once per run of tail books.
          const tailBook = !isAdmin && !viewerCompleted && isTailBook(book, viewerRef, bookMode.viewerAssignmentBookIds)
          const previous = books[index - 1]
          const previousIsTail = previous && !isAdmin && !viewerCompleted && isTailBook(previous, viewerRef, bookMode.viewerAssignmentBookIds)
          return <div className="nd-mb-list-item" key={book.bookId}>
            {tailBook && !previousIsTail && (
              <div data-testid="matching-tail-divider">
                <h3 className="nd-mb-divider">Записаться пока нельзя</h3>
                <p className="nd-mb-divider-note">Эти книги остаются в вашем списке, но в подборе не участвуют.</p>
              </div>
            )}
            <MatchingBookCard
              book={book}
              viewerRef={viewerRef}
              viewerHasHard={viewerHasHard}
              readOnly={readOnly}
              readOnlyNote={viewerCompleted ? 'Ваш подбор завершён — книга доступна только для просмотра' : undefined}
              adminMode={isAdmin}
              controlsDisabled={pending !== null}
              pendingAction={pending?.bookId === book.bookId && ['setConditional', 'unsetConditional', 'setHard', 'cancelHard'].includes(pending.action) ? pending.action as MatchingBookCommandAction : null}
              returnPending={pending?.bookId === book.bookId && pending.action === 'returnToMatching'}
              onCommand={command}
              onReturnToMatching={returnToMatching}
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

'use client'

import { useRef, useState } from 'react'
import { useBookDetail } from './BookDetailProvider'
import MatchingBookCard, { type MatchingBookCommandAction } from './MatchingBookCard'
import MatchingBookAdminControls, { type MatchingBookAdminAction, type MatchingBookAdminCommand } from './MatchingBookAdminControls'
import type { ScenarioBookMeta } from './MatchingScenarios'
import {
  matchingBookDetail,
  type MatchingBookModeState,
} from './matching-book-types'

interface Props {
  sessionId: string
  stateVersion: number
  sessionStatus: string
  viewerRef: string
  bookMode: MatchingBookModeState
  booksById: Record<string, ScenarioBookMeta>
  isAdmin: boolean
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
  onState,
  onRefresh,
}: Props) {
  const { openBook } = useBookDetail()
  const [pending, setPending] = useState<PendingCommand>(null)
  const [message, setMessage] = useState<string | null>(null)
  const focusRef = useRef<{ bookId: string; element: HTMLButtonElement } | null>(null)
  const viewerHardBookId = bookMode.books.find((book) => book.viewerStatus === 'hard')?.bookId ?? null
  const readOnly = sessionStatus === 'closed' || sessionStatus === 'frozen'
  // The read model owns canonical sorting (including catalog-order tie breaking).
  const books = bookMode.books

  async function command(action: MatchingBookCommandAction, bookId: string, control: HTMLButtonElement) {
    if (pending) return
    focusRef.current = { bookId, element: control }
    setPending({ action, bookId })
    setMessage(null)
    try {
      const response = await fetch(`/api/matching/sessions/${sessionId}/book-actions`, {
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
      if (!response.ok) throw new Error(body.error ?? 'Не удалось изменить выбор')
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
          bookId: command.destinationBookId ?? bookId,
          userId: command.participant?.adminUserId,
          participantRef: command.participant?.ref,
          participant: undefined,
          destinationBookId: undefined,
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
        <h2>{isAdmin ? 'Книги сессии' : 'Ваши книги'}</h2>
        <p>{isAdmin
          ? 'Здесь можно увидеть и скорректировать актуальные договорённости участников.'
          : 'Посмотрите, кто ещё записался на книги, которые вы выбрали. Сделайте окончательный выбор. Можете выбрать «Готов читать» у нескольких вариантов, тогда вы автоматически попадёте в группу, как только наберётся достаточное число участников.'}
        </p>
        {readOnly && !isAdmin && (
          <div className="nd-mb-slot" data-testid="matching-books-readonly">Сессия закрыта — выбор доступен только для просмотра</div>
        )}
        {bookMode.viewerAssignmentBookId ? (
          <div className="nd-mb-slot is-taken">● Ваш слот занят: <strong>{books.find((book) => book.bookId === bookMode.viewerAssignmentBookId)?.title ?? 'книга выбрана'}</strong></div>
        ) : viewerHardBookId ? (
          <div className="nd-mb-slot is-open">● Вы записались на <strong>{books.find((book) => book.bookId === viewerHardBookId)?.title}</strong>. Круг ещё формируется.</div>
        ) : null}
      </header>
      {message && <div className="nd-mb-message" data-testid="matching-books-message" aria-live="polite">{message}</div>}
      <div className="nd-mb-list">
        {books.map((book) => (
          <MatchingBookCard
            key={book.bookId}
            book={book}
            viewerRef={viewerRef}
            viewerAssignmentBookId={bookMode.viewerAssignmentBookId}
            viewerHardBookId={viewerHardBookId}
            readOnly={readOnly}
            adminMode={isAdmin}
            controlsDisabled={pending !== null}
            pendingAction={pending?.bookId === book.bookId && ['setConditional', 'unsetConditional', 'setHard', 'cancelHard'].includes(pending.action) ? pending.action as MatchingBookCommandAction : null}
            onCommand={command}
            onOpenBook={(selected, control) => {
              focusRef.current = { bookId: selected.bookId, element: control }
              openBook(matchingBookDetail(selected, booksById[selected.bookId]), [], selected.participants)
            }}
            adminControls={isAdmin ? (
              <MatchingBookAdminControls
                book={book}
                books={books}
                adminParticipants={bookMode.adminParticipants ?? []}
                pending={pending !== null}
                onAction={(command) => adminCommand(book.bookId, command)}
              />
            ) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

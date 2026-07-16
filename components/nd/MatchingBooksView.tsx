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
  minGroupSize: number
  bookMode: MatchingBookModeState
  booksById: Record<string, ScenarioBookMeta>
  isAdmin: boolean
  mutationUserId?: string
  onState: (state: unknown) => void
  onRefresh: () => Promise<void>
}

type PendingCommand = { bookId: string; action: MatchingBookCommandAction | MatchingBookAdminAction } | null

function peopleWord(count: number) {
  const ones = count % 10
  const tens = count % 100
  if (ones === 1 && tens !== 11) return 'человек'
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 'человека'
  return 'человек'
}

export default function MatchingBooksView({
  sessionId,
  stateVersion,
  sessionStatus,
  viewerRef,
  minGroupSize,
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
  const [switchTargetBookId, setSwitchTargetBookId] = useState<string | null>(null)
  const focusRef = useRef<{ bookId: string; element: HTMLButtonElement } | null>(null)
  const viewerHardBookId = bookMode.books.find((book) => book.viewerStatus === 'hard')?.bookId ?? null
  const viewerSelectedBookId = bookMode.viewerAssignmentBookId
  const selectedBook = booksById[viewerSelectedBookId ?? ''] ?? bookMode.books.find(book => book.bookId === viewerSelectedBookId)
  const readOnly = sessionStatus === 'closed' || sessionStatus === 'frozen'
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
      setSwitchTargetBookId(null)
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
    if (action === 'setHard' && viewerHardBookId && viewerHardBookId !== bookId) {
      focusRef.current = { bookId, element: control }
      setSwitchTargetBookId(bookId)
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-testid="matching-book-card-${CSS.escape(bookId)}"] [data-testid="matching-hard-switch-confirm"]`)?.focus()
      })
      return
    }
    void performCommand(action, bookId, control)
  }

  function cancelHardSwitch(bookId: string) {
    setSwitchTargetBookId(null)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-testid="matching-book-card-${CSS.escape(bookId)}"] .nd-mb-btn.is-hard`)?.focus()
    })
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
        <h2>{isAdmin ? 'Книги сессии' : 'Совпадения по вашим книгам'}</h2>
        {isAdmin ? (
          <p>Здесь можно увидеть и скорректировать актуальные договорённости участников.</p>
        ) : <>
          <p className="nd-mb-intro-copy-desktop">{`Выберите одну книгу, которую будете читать. Книги отсортированы по степени интереса участни:ц, добавивших их в свои списки. Нажмите на имя участни:цы, чтобы узнать, на какое место он:а поместила книгу. В меню кнопки «Записаться ▾» можно включить авто-запись сразу на нескольких книгах — вас запишут на первую, на которую соберётся круг (${minGroupSize} ${peopleWord(minGroupSize)}).`}</p>
          <p className="nd-mb-intro-copy-mobile">{`Выберите одну книгу, которую будете читать. В меню кнопки «Записаться ▾» отметьте несколько книг — вас запишут на первую, где соберётся круг из ${minGroupSize} человек.`}</p>
        </>}
        {readOnly && !isAdmin && (
          <div className="nd-mb-slot" data-testid="matching-books-readonly">Сессия закрыта — выбор доступен только для просмотра</div>
        )}
      </header>
      {viewerSelectedBookId && selectedBook && !isAdmin && (
        <div className="nd-mb-selection" data-testid="matching-books-selection">
          <span>Вы записаны на <strong>{selectedBook.title}</strong></span>
          <button
            type="button"
            className="p-link muted"
            disabled={pending !== null}
            onClick={(event) => {
              if (bookMode.viewerAssignmentBookId) {
                setMessage('Круг уже собрался — отмена затронет остальных, напишите организатору.')
                return
              }
              void performCommand('cancelHard', viewerSelectedBookId, event.currentTarget)
            }}
          >
            {pending?.bookId === viewerSelectedBookId && pending.action === 'cancelHard' ? 'Отменяем…' : 'Отменить'}
          </button>
        </div>
      )}
      {message && <div className="nd-mb-message" data-testid="matching-books-message" aria-live="polite">{message}</div>}
      <div className="nd-mb-list">
        {books.map((book, index) => {
          const viewerOnlyTail = !isAdmin && book.intersectionCount === 0 && book.formedAt === null &&
            book.bookId !== bookMode.viewerAssignmentBookId && book.bookId !== viewerHardBookId
          const previous = books[index - 1]
          const previousIsTail = previous && previous.intersectionCount === 0 && previous.formedAt === null &&
            previous.bookId !== bookMode.viewerAssignmentBookId && previous.bookId !== viewerHardBookId
          return <div className="nd-mb-list-item" key={book.bookId}>
            {viewerOnlyTail && !previousIsTail && (
              <div className="nd-mb-divider" data-testid="matching-viewer-only-divider">Только в вашем списке</div>
            )}
            <MatchingBookCard
              book={book}
              viewerRef={viewerRef}
              viewerAssignmentBookId={bookMode.viewerAssignmentBookId}
              viewerHardBookId={viewerHardBookId}
              minGroupSize={minGroupSize}
              readOnly={readOnly}
              adminMode={isAdmin}
              controlsDisabled={pending !== null}
              pendingAction={pending?.bookId === book.bookId && ['setConditional', 'unsetConditional', 'setHard', 'cancelHard'].includes(pending.action) ? pending.action as MatchingBookCommandAction : null}
              switchFromBookTitle={switchTargetBookId === book.bookId
                ? books.find(item => item.bookId === viewerHardBookId)?.title ?? null
                : null}
              onConfirmSwitch={(control) => void performCommand('setHard', book.bookId, control)}
              onCancelSwitch={() => cancelHardSwitch(book.bookId)}
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
    case 'session_frozen':
    case 'book_action_forbidden':
      return 'Сейчас изменить выбор нельзя. Обновите страницу, чтобы увидеть актуальное состояние.'
    case 'participant_missing':
      return 'Вы больше не участвуете в этой сессии.'
    default:
      return 'Не удалось изменить выбор. Обновите страницу и попробуйте снова.'
  }
}

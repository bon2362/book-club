'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CatalogBook } from '@/lib/matching/personal-list'
import CoverImage from './CoverImage'

// BookParticipant stays — used for chips in the popup
export interface BookParticipant {
  userId: string
  bookId: string
  pseudonym: string
  rank: number | null
  personalStatus: string | null
}

const PSEUDONYM_COLORS = [
  { chip: 'bg-[#fde8d8] text-[#7c3516]', border: 'border-[#f8c4a0]' },
  { chip: 'bg-[#dcfce7] text-[#14532d]', border: 'border-[#86efac]' },
  { chip: 'bg-[#dbeafe] text-[#1e3a8a]', border: 'border-[#93c5fd]' },
  { chip: 'bg-[#fef9c3] text-[#713f12]', border: 'border-[#fde047]' },
  { chip: 'bg-[#f3e8ff] text-[#581c87]', border: 'border-[#d8b4fe]' },
  { chip: 'bg-[#ffe4e6] text-[#881337]', border: 'border-[#fda4af]' },
  { chip: 'bg-[#d1fae5] text-[#065f46]', border: 'border-[#6ee7b7]' },
  { chip: 'bg-[#e0f2fe] text-[#075985]', border: 'border-[#7dd3fc]' },
]

function getPseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

function interestLabel(rank: number | null, personalStatus: string | null): string {
  if (personalStatus === 'reading') return 'читаю'
  if (personalStatus === 'read') return 'прочитал(а)'
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
}

interface SortableRowProps {
  book: CatalogBook
  index: number
  frozen: boolean
  onClick: (book: CatalogBook) => void
}

function SortableRow({ book, index, frozen, onClick }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen,
  })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'var(--bg-elevated)' : undefined,
        alignItems: 'start',
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      {/* Rank + drag handle stacked */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        {book.rank != null && (
          <span className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>
            #{index + 1}
          </span>
        )}
        {!frozen && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Перетащить книгу ${book.title}`}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab select-none touch-none text-base leading-none"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          >
            ⠿
          </button>
        )}
      </div>

      {/* Cover + title + author */}
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}

interface StatusRowProps {
  book: CatalogBook
  onClick: (book: CatalogBook) => void
}

function StatusRow({ book, onClick }: StatusRowProps) {
  const statusIcon = book.personalStatus === 'reading' ? '📖' : '✓'
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        opacity: 0.7,
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center pt-1">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{statusIcon}</span>
      </div>
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}

interface CatalogRowProps {
  book: CatalogBook
  onClick: (book: CatalogBook) => void
}

function CatalogRow({ book, onClick }: CatalogRowProps) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center pt-1">
        <span className="text-base leading-none" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>+</span>
      </div>
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}

interface BookDetailModalProps {
  book: CatalogBook
  chips: BookParticipant[]
  viewingUserId: string
  frozen: boolean
  onClose: () => void
  onStatusChange: (bookId: string, status: string | null) => Promise<void>
  onAddToList: (bookId: string) => Promise<void>
  onRemoveFromList: (bookId: string) => Promise<void>
}

function BookDetailModal({
  book,
  chips,
  viewingUserId,
  frozen,
  onClose,
  onStatusChange,
  onAddToList,
  onRemoveFromList,
}: BookDetailModalProps) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAddToList() {
    setBusy(true)
    try { await onAddToList(book.bookId) } finally { setBusy(false) }
  }

  async function handleRemoveFromList() {
    setBusy(true)
    try { await onRemoveFromList(book.bookId) } finally { setBusy(false) }
  }

  async function handleStatusChange(newStatus: string | null) {
    setBusy(true)
    try { await onStatusChange(book.bookId, newStatus) } finally { setBusy(false) }
  }

  const meta: string[] = []
  if (book.publishedDate) meta.push(book.publishedDate.split('/').at(-1) ?? book.publishedDate)
  if (book.pages) meta.push(`${book.pages} стр.`)

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(26, 23, 20, 0.4)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        className="border rounded-xl p-5 max-w-[420px] w-full"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 70px rgba(26,23,20,0.18)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Cover + title */}
        <div className="flex gap-4 mb-4">
          <div className="relative rounded overflow-hidden shrink-0" style={{ width: 64, height: 92 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold text-base leading-snug mb-1"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text)' }}
            >
              {book.title}
            </div>
            <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
              {book.author}
            </div>
            {meta.length > 0 && (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {meta.join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Participant chips */}
        {chips.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Участники
            </div>
            <div className="flex flex-wrap gap-1">
              {chips.map((p) => {
                const colors = getPseudonymColor(p.pseudonym)
                const isMe = p.userId === viewingUserId
                const label = interestLabel(p.rank, p.personalStatus)
                const rankStr = p.rank != null ? ` #${p.rank}` : ''
                return (
                  <span
                    key={p.userId}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${colors.chip} ${colors.border} ${isMe ? 'ring-1 ring-current' : ''}`}
                    title={isMe ? 'Это вы' : undefined}
                  >
                    {p.pseudonym} · {label}{rankStr}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {book.description && (
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: 'var(--text-body)' }}
          >
            {book.description}
          </p>
        )}

        {/* Status (only if in list and not frozen) */}
        {book.isInList && !frozen && (
          <div className="mb-4">
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Статус
            </label>
            <select
              value={book.personalStatus ?? ''}
              onChange={(e) => handleStatusChange(e.target.value || null)}
              disabled={busy}
              className="w-full text-sm border rounded-lg px-3 py-2 cursor-pointer"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
              }}
            >
              <option value="">В списке</option>
              <option value="reading">Читаю сейчас</option>
              <option value="read">Прочитал(а)</option>
            </select>
          </div>
        )}

        {/* Add/Remove buttons */}
        {!frozen && (
          <div className="flex gap-2">
            {book.isInList ? (
              <button
                onClick={handleRemoveFromList}
                disabled={busy}
                className="flex-1 text-sm py-2 px-3 rounded-lg border transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy ? '…' : 'Убрать из списка'}
              </button>
            ) : (
              <button
                onClick={handleAddToList}
                disabled={busy}
                className="flex-1 text-sm py-2 px-3 rounded-lg border transition-colors font-medium"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? '…' : 'Добавить в список'}
              </button>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 text-xs cursor-pointer block"
          style={{ color: 'var(--text-muted)' }}
        >
          Закрыть (Esc)
        </button>
      </div>
    </div>
  )
}

async function patchPriorities(bookIds: string[]) {
  await fetch('/api/matching/priorities', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookIds }),
  })
}

async function patchStatus(bookId: string, status: string | null) {
  await fetch(`/api/signup-books/${bookId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

async function addToList(bookId: string) {
  await fetch('/api/matching/books', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookId }),
  })
}

async function removeFromList(bookId: string) {
  await fetch(`/api/matching/books/${bookId}`, { method: 'DELETE' })
}

export default function MatchingPersonalList({
  books: initialBooks,
  bookParticipants,
  viewingUserId,
  frozen = false,
}: Props) {
  const [books, setBooks] = useState(initialBooks)
  const [announcement, setAnnouncement] = useState('')
  const [modalBook, setModalBook] = useState<CatalogBook | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeBooks = books.filter((b) => b.isInList && b.personalStatus === null)
  const statusBooks = books.filter((b) => b.isInList && b.personalStatus !== null)
  const catalogOnlyBooks = books.filter((b) => !b.isInList)

  function rerank(updatedBooks: CatalogBook[]): CatalogBook[] {
    let rankCounter = 0
    return updatedBooks.map((b) => {
      if (b.isInList && b.personalStatus === null) {
        rankCounter++
        return { ...b, rank: rankCounter }
      }
      return { ...b, rank: null }
    })
  }

  const applyNewOrder = useCallback(async (newBooks: CatalogBook[]) => {
    const reranked = rerank(newBooks)
    setBooks(reranked)
    await patchPriorities(
      reranked.filter((b) => b.isInList && b.personalStatus === null).map((b) => b.bookId)
    )
    return reranked
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const currentActive = books.filter((b) => b.isInList && b.personalStatus === null)
      const oldIndex = currentActive.findIndex((b) => b.bookId === active.id)
      const newIndex = currentActive.findIndex((b) => b.bookId === over.id)
      const reorderedActive = arrayMove(currentActive, oldIndex, newIndex)
      const rest = books.filter((b) => !(b.isInList && b.personalStatus === null))
      await applyNewOrder([...reorderedActive, ...rest])
      setAnnouncement(
        `Книга ${currentActive[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleStatusChange = useCallback(
    async (bookId: string, newStatus: string | null) => {
      const updatedBooks = books.map((b) =>
        b.bookId === bookId ? { ...b, personalStatus: newStatus } : b,
      )
      const rankedActive = updatedBooks
        .filter((b) => b.isInList && b.personalStatus === null && b.rank !== null)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      const unrankedActive = updatedBooks.filter(
        (b) => b.isInList && b.personalStatus === null && b.rank === null,
      )
      const statusBooksUpdated = updatedBooks.filter((b) => b.isInList && b.personalStatus !== null)
      const catalog = updatedBooks.filter((b) => !b.isInList)
      const merged = [...rankedActive, ...unrankedActive, ...statusBooksUpdated, ...catalog]
      setBooks(merged)
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, personalStatus: newStatus } : prev))
      await Promise.all([
        patchStatus(bookId, newStatus),
        patchPriorities(rankedActive.map((b) => b.bookId)),
      ])
    },
    [books],
  )

  const handleAddToList = useCallback(
    async (bookId: string) => {
      setBooks((prev) =>
        prev.map((b) => (b.bookId === bookId ? { ...b, isInList: true, rank: null } : b)),
      )
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, isInList: true } : prev))
      await addToList(bookId)
    },
    [],
  )

  const handleRemoveFromList = useCallback(
    async (bookId: string) => {
      setBooks((prev) => {
        const updated = prev.map((b) =>
          b.bookId === bookId ? { ...b, isInList: false, rank: null, personalStatus: null } : b,
        )
        return rerank(updated)
      })
      setModalBook((prev) =>
        prev?.bookId === bookId ? { ...prev, isInList: false, rank: null, personalStatus: null } : prev,
      )
      await removeFromList(bookId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="dnd-announcement"
        className="absolute w-px h-px overflow-hidden"
        style={{ clip: 'rect(0,0,0,0)' }}
      >
        {announcement}
      </div>

      {modalBook && (
        <BookDetailModal
          book={modalBook}
          chips={bookParticipants.filter((p) => p.bookId === modalBook.bookId)}
          viewingUserId={viewingUserId}
          frozen={frozen}
          onClose={() => setModalBook(null)}
          onStatusChange={handleStatusChange}
          onAddToList={handleAddToList}
          onRemoveFromList={handleRemoveFromList}
        />
      )}

      {/* Active ranked books (drag-and-drop) */}
      {activeBooks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={activeBooks.map((b) => b.bookId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="list-none p-0 m-0" data-testid="matching-personal-list">
              {activeBooks.map((book, idx) => (
                <SortableRow
                  key={book.bookId}
                  book={book}
                  index={idx}
                  frozen={frozen}
                  onClick={setModalBook}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Status books section */}
      {statusBooks.length > 0 && (
        <>
          <div
            className="px-4 py-2 border-b border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide block"
              style={{ color: 'var(--text-muted)' }}
            >
              В процессе / Прочитано
            </span>
            <span
              className="text-[10px] block mt-0.5"
              style={{ color: 'var(--text-muted)', opacity: 0.75 }}
            >
              исключены при расчёте ваших сценариев и ходов
            </span>
          </div>
          <ul className="list-none p-0 m-0">
            {statusBooks.map((book) => (
              <StatusRow key={book.bookId} book={book} onClick={setModalBook} />
            ))}
          </ul>
        </>
      )}

      {/* Catalog (not in list) */}
      {catalogOnlyBooks.length > 0 && (
        <>
          <div
            className="px-4 py-2 border-b border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Все книги клуба
            </span>
          </div>
          <ul className="list-none p-0 m-0">
            {catalogOnlyBooks.map((book) => (
              <CatalogRow key={book.bookId} book={book} onClick={setModalBook} />
            ))}
          </ul>
        </>
      )}

      {activeBooks.length === 0 && statusBooks.length === 0 && catalogOnlyBooks.length === 0 && (
        <div
          className="flex flex-col items-center justify-center h-full p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <div className="text-4xl mb-3">📚</div>
          <p className="text-sm leading-relaxed">Нет опубликованных книг.</p>
        </div>
      )}
    </>
  )
}

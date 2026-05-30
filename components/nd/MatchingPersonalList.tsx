'use client'

import { useState, useCallback } from 'react'
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
import type { PersonalListBook } from '@/lib/matching/personal-list'
import CoverImage from './CoverImage'

export interface BookParticipant {
  userId: string
  bookId: string
  pseudonym: string
  rank: number | null
  personalStatus: string | null
}

interface Props {
  books: PersonalListBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
}

const PSEUDONYM_COLORS = [
  { chip: 'bg-[#fde8d8] text-[#7c3516]', border: 'border-[#f8c4a0]', ring: 'ring-[#7c3516]' },
  { chip: 'bg-[#dcfce7] text-[#14532d]', border: 'border-[#86efac]', ring: 'ring-[#14532d]' },
  { chip: 'bg-[#dbeafe] text-[#1e3a8a]', border: 'border-[#93c5fd]', ring: 'ring-[#1e3a8a]' },
  { chip: 'bg-[#fef9c3] text-[#713f12]', border: 'border-[#fde047]', ring: 'ring-[#713f12]' },
  { chip: 'bg-[#f3e8ff] text-[#581c87]', border: 'border-[#d8b4fe]', ring: 'ring-[#581c87]' },
  { chip: 'bg-[#ffe4e6] text-[#881337]', border: 'border-[#fda4af]', ring: 'ring-[#881337]' },
  { chip: 'bg-[#d1fae5] text-[#065f46]', border: 'border-[#6ee7b7]', ring: 'ring-[#065f46]' },
  { chip: 'bg-[#e0f2fe] text-[#075985]', border: 'border-[#7dd3fc]', ring: 'ring-[#075985]' },
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

interface SortableRowProps {
  book: PersonalListBook
  index: number
  total: number
  frozen: boolean
  chipsForBook: BookParticipant[]
  viewingUserId: string
  onMoveUp: (bookId: string) => void
  onMoveDown: (bookId: string) => void
  onStatusChange: (bookId: string, status: string | null) => void
}

function SortableRow({
  book,
  index,
  total,
  frozen,
  chipsForBook,
  viewingUserId,
  onMoveUp,
  onMoveDown,
  onStatusChange,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen,
  })

  const canReorder = !frozen

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'grid',
        gridTemplateColumns: '52px 1fr 90px',
        gap: '14px',
        padding: '14px 16px',
        borderBottom: '1px solid #ded6c8',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? '#fff7e7' : undefined,
        alignItems: 'start',
      }}
    >
      {/* Cover with drag handle */}
      <div style={{ position: 'relative' }}>
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Перетащить книгу ${book.title}`}
            className="absolute text-[#ccc] cursor-grab hover:text-[#999] select-none touch-none text-lg leading-none"
            style={{ left: -14, top: '50%', transform: 'translateY(-50%)' }}
          >
            ⠿
          </button>
        )}
        <div className="relative rounded overflow-hidden" style={{ width: 48, height: 68 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
      </div>

      {/* Title / author / participant chips */}
      <div className="min-w-0">
        <div className="font-semibold text-sm leading-snug mb-0.5 text-[#191817]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
        </div>
        <div className="text-xs text-[#6d675f] mb-2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
        {!frozen && (
          <select
            value={book.personalStatus ?? ''}
            onChange={(e) => onStatusChange(book.bookId, e.target.value || null)}
            className="text-[11px] border border-[#ded6c8] rounded px-1.5 py-0.5 bg-[#fafaf8] text-[#6d675f] cursor-pointer hover:border-[#bbb] mb-1.5"
          >
            <option value="">В списке</option>
            <option value="reading">Читаю сейчас</option>
            <option value="read">Прочитал(а)</option>
          </select>
        )}
        {chipsForBook.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chipsForBook.map((p) => {
              const colors = getPseudonymColor(p.pseudonym)
              const isMe = p.userId === viewingUserId
              const label = interestLabel(p.rank, p.personalStatus)
              const rankStr = p.rank != null ? ` #${p.rank}` : ''
              return (
                <span
                  key={p.userId}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${colors.chip} ${colors.border} ${isMe ? `ring-1 ${colors.ring}` : ''}`}
                  title={isMe ? 'Это вы' : undefined}
                >
                  {p.pseudonym} · {label}{rankStr}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Rank + reorder */}
      <div className="flex flex-col items-end gap-1">
        {book.rank != null && (
          <span className="text-2xl font-bold leading-none text-[#191817]">#{book.rank}</span>
        )}
        <span className="text-[10px] text-[#6d675f]">место в списке</span>
        {canReorder && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            <button
              onClick={() => onMoveUp(book.bookId)}
              disabled={index === 0}
              aria-label={`Переместить ${book.title} выше`}
              className={`text-[11px] px-1.5 py-0.5 leading-none border rounded transition-colors ${
                index === 0
                  ? 'text-[#ddd] border-[#eee] cursor-default'
                  : 'text-[#999] border-[#ddd] hover:text-[#555] hover:border-[#bbb] cursor-pointer'
              }`}
            >
              ▲
            </button>
            <button
              onClick={() => onMoveDown(book.bookId)}
              disabled={index === total - 1}
              aria-label={`Переместить ${book.title} ниже`}
              className={`text-[11px] px-1.5 py-0.5 leading-none border rounded transition-colors ${
                index === total - 1
                  ? 'text-[#ddd] border-[#eee] cursor-default'
                  : 'text-[#999] border-[#ddd] hover:text-[#555] hover:border-[#bbb] cursor-pointer'
              }`}
            >
              ▼
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

interface StatusRowProps {
  book: PersonalListBook
  chipsForBook: BookParticipant[]
  viewingUserId: string
  frozen: boolean
  onStatusChange: (bookId: string, status: string | null) => void
}

function StatusRow({ book, chipsForBook, viewingUserId, frozen, onStatusChange }: StatusRowProps) {
  const statusLabel = book.personalStatus === 'reading' ? 'Читаю' : 'Прочитал(а)'
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr',
        gap: '14px',
        padding: '14px 16px',
        borderBottom: '1px solid #ded6c8',
        alignItems: 'start',
        opacity: 0.75,
      }}
    >
      <div style={{ position: 'relative' }}>
        <div className="relative rounded overflow-hidden" style={{ width: 48, height: 68 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm leading-snug mb-0.5 text-[#191817]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
        </div>
        <div className="text-xs text-[#6d675f] mb-2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
        {!frozen ? (
          <select
            value={book.personalStatus ?? ''}
            onChange={(e) => onStatusChange(book.bookId, e.target.value || null)}
            className="text-[11px] border border-[#ded6c8] rounded px-1.5 py-0.5 bg-[#fafaf8] text-[#6d675f] cursor-pointer hover:border-[#bbb] mb-1.5"
          >
            <option value="">В списке</option>
            <option value="reading">Читаю сейчас</option>
            <option value="read">Прочитал(а)</option>
          </select>
        ) : (
          <span className="text-[11px] text-[#999] italic mb-1.5">{statusLabel}</span>
        )}
        {chipsForBook.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chipsForBook.map((p) => {
              const colors = getPseudonymColor(p.pseudonym)
              const isMe = p.userId === viewingUserId
              const label = interestLabel(p.rank, p.personalStatus)
              const rankStr = p.rank != null ? ` #${p.rank}` : ''
              return (
                <span
                  key={p.userId}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${colors.chip} ${colors.border} ${isMe ? `ring-1 ${colors.ring}` : ''}`}
                  title={isMe ? 'Это вы' : undefined}
                >
                  {p.pseudonym} · {label}{rankStr}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </li>
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

export default function MatchingPersonalList({
  books: initialBooks,
  bookParticipants,
  viewingUserId,
  frozen = false,
}: Props) {
  const [books, setBooks] = useState(initialBooks)
  const [announcement, setAnnouncement] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Re-rank all active books (personalStatus === null) and clear rank on status books
  function rerank(updatedBooks: PersonalListBook[]): PersonalListBook[] {
    let rankCounter = 0
    return updatedBooks.map((b) => {
      if (b.personalStatus === null) {
        rankCounter++
        return { ...b, rank: rankCounter }
      }
      return { ...b, rank: null }
    })
  }

  const applyNewOrder = useCallback(async (newBooks: PersonalListBook[]) => {
    const reranked = rerank(newBooks)
    setBooks(reranked)
    await patchPriorities(reranked.filter((b) => b.personalStatus === null).map((b) => b.bookId))
    return reranked
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      // Only active books are in the DnD context; find within active books
      const activeBooks = books.filter((b) => b.personalStatus === null)
      const oldIndex = activeBooks.findIndex((b) => b.bookId === active.id)
      const newIndex = activeBooks.findIndex((b) => b.bookId === over.id)
      const reorderedActive = arrayMove(activeBooks, oldIndex, newIndex)
      // Reconstruct full list: active books (reordered) then status books
      const statusBooks = books.filter((b) => b.personalStatus !== null)
      const newBooks = [...reorderedActive, ...statusBooks]
      await applyNewOrder(newBooks)
      setAnnouncement(
        `Книга ${activeBooks[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleMoveUp = useCallback(
    async (bookId: string) => {
      const activeBooks = books.filter((b) => b.personalStatus === null)
      const index = activeBooks.findIndex((b) => b.bookId === bookId)
      if (index <= 0) return
      const reorderedActive = arrayMove(activeBooks, index, index - 1)
      const statusBooks = books.filter((b) => b.personalStatus !== null)
      await applyNewOrder([...reorderedActive, ...statusBooks])
      setAnnouncement(
        `Книга ${activeBooks[index].title} перемещена на позицию ${index} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleMoveDown = useCallback(
    async (bookId: string) => {
      const activeBooks = books.filter((b) => b.personalStatus === null)
      const index = activeBooks.findIndex((b) => b.bookId === bookId)
      if (index >= activeBooks.length - 1) return
      const reorderedActive = arrayMove(activeBooks, index, index + 1)
      const statusBooks = books.filter((b) => b.personalStatus !== null)
      await applyNewOrder([...reorderedActive, ...statusBooks])
      setAnnouncement(
        `Книга ${activeBooks[index].title} перемещена на позицию ${index + 2} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleStatusChange = useCallback(
    async (bookId: string, newStatus: string | null) => {
      if (newStatus === null) {
        // Book returning to active: preserve existing active books' ranks,
        // append the returning book at the end without a rank (rank: null).
        // final_pos = after all ranked active books, unranked at tail.
        const updatedBooks = books.map((b) =>
          b.bookId === bookId ? { ...b, personalStatus: null, rank: null } : b,
        )
        // Active books: ranked ones first (sorted by rank), then unranked at tail
        const rankedActive = updatedBooks
          .filter((b) => b.personalStatus === null && b.rank !== null)
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
        const unrankedActive = updatedBooks.filter(
          (b) => b.personalStatus === null && b.rank === null,
        )
        const statusBooks = updatedBooks.filter((b) => b.personalStatus !== null)
        const merged = [...rankedActive, ...unrankedActive, ...statusBooks]
        setBooks(merged)

        await Promise.all([
          patchStatus(bookId, newStatus),
          // Only send already-ranked active books to preserve their positions;
          // do not include the newly returned book so it stays unranked.
          patchPriorities(rankedActive.map((b) => b.bookId)),
        ])
      } else {
        // Book leaving active (status → reading/read): re-rank remaining active
        // books to fill the gap left by the departing book.
        const updatedBooks = books.map((b) =>
          b.bookId === bookId ? { ...b, personalStatus: newStatus } : b,
        )
        const activeBooks = updatedBooks.filter((b) => b.personalStatus === null)
        const statusBooks = updatedBooks.filter((b) => b.personalStatus !== null)
        const reranked = rerank([...activeBooks, ...statusBooks])
        setBooks(reranked)

        await Promise.all([
          patchStatus(bookId, newStatus),
          patchPriorities(reranked.filter((b) => b.personalStatus === null).map((b) => b.bookId)),
        ])
      }
    },
    [books],
  )

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#6d675f]">
        <div className="text-4xl mb-3">📚</div>
        <p className="text-sm leading-relaxed">
          Вы ещё не добавили книги.{' '}
          <a href="/" className="underline text-[#0f766e] hover:text-[#0a5c54]">
            Перейдите в каталог
          </a>
          , чтобы выбрать книги для чтения.
        </p>
      </div>
    )
  }

  const activeBooks = books.filter((b) => b.personalStatus === null)
  const statusBooks = books.filter((b) => b.personalStatus !== null)

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={activeBooks.map((b) => b.bookId)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="list-none p-0 m-0" data-testid="matching-personal-list">
            {activeBooks.map((book, idx) => {
              const chipsForBook = bookParticipants.filter((p) => p.bookId === book.bookId)
              return (
                <SortableRow
                  key={book.bookId}
                  book={book}
                  index={idx}
                  total={activeBooks.length}
                  frozen={frozen}
                  chipsForBook={chipsForBook}
                  viewingUserId={viewingUserId}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onStatusChange={handleStatusChange}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {statusBooks.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-[#ded6c8] border-t bg-[#f6f2e8]">
            <span className="text-[11px] font-medium text-[#999] uppercase tracking-wide">
              В процессе / Прочитано
            </span>
          </div>
          <ul className="list-none p-0 m-0">
            {statusBooks.map((book) => {
              const chipsForBook = bookParticipants.filter((p) => p.bookId === book.bookId)
              return (
                <StatusRow
                  key={book.bookId}
                  book={book}
                  chipsForBook={chipsForBook}
                  viewingUserId={viewingUserId}
                  frozen={frozen}
                  onStatusChange={handleStatusChange}
                />
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

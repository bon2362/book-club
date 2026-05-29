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

function interestLabel(rank: number | null, readingStatus: string | null): string {
  if (readingStatus === 'reading') return 'читается'
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
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen || book.readingStatus === 'reading',
  })

  const canReorder = !frozen && book.readingStatus !== 'reading'

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
        opacity: isDragging ? 0.5 : book.readingStatus === 'reading' ? 0.7 : 1,
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
        {chipsForBook.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chipsForBook.map((p) => {
              const colors = getPseudonymColor(p.pseudonym)
              const isMe = p.userId === viewingUserId
              const label = interestLabel(p.rank, book.readingStatus)
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

async function patchPriorities(bookIds: string[]) {
  await fetch('/api/matching/priorities', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookIds }),
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

  const applyNewOrder = useCallback(async (newBooks: PersonalListBook[]) => {
    const rankable = newBooks.filter((b) => b.readingStatus !== 'reading')
    const ranked = rankable.map((b, i) => ({ ...b, rank: i + 1 }))
    const updated = newBooks.map((b) => {
      const r = ranked.find((rb) => rb.bookId === b.bookId)
      return r ?? b
    })
    setBooks(updated)
    await patchPriorities(rankable.map((b) => b.bookId))
    return updated
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = books.findIndex((b) => b.bookId === active.id)
      const newIndex = books.findIndex((b) => b.bookId === over.id)
      const newBooks = arrayMove(books, oldIndex, newIndex)
      await applyNewOrder(newBooks)
      setAnnouncement(
        `Книга ${books[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${books.filter((b) => b.readingStatus !== 'reading').length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleMoveUp = useCallback(
    async (bookId: string) => {
      const index = books.findIndex((b) => b.bookId === bookId)
      if (index <= 0) return
      const newBooks = arrayMove(books, index, index - 1)
      await applyNewOrder(newBooks)
      setAnnouncement(
        `Книга ${books[index].title} перемещена на позицию ${index} из ${books.filter((b) => b.readingStatus !== 'reading').length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleMoveDown = useCallback(
    async (bookId: string) => {
      const index = books.findIndex((b) => b.bookId === bookId)
      if (index >= books.length - 1) return
      const newBooks = arrayMove(books, index, index + 1)
      await applyNewOrder(newBooks)
      setAnnouncement(
        `Книга ${books[index].title} перемещена на позицию ${index + 2} из ${books.filter((b) => b.readingStatus !== 'reading').length}`,
      )
    },
    [books, applyNewOrder],
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

  const rankableCount = books.filter((b) => b.readingStatus !== 'reading').length

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
        <SortableContext items={books.map((b) => b.bookId)} strategy={verticalListSortingStrategy}>
          <ul className="list-none p-0 m-0" data-testid="matching-personal-list">
            {books.map((book, idx) => {
              const chipsForBook = bookParticipants.filter((p) => p.bookId === book.bookId)
              return (
                <SortableRow
                  key={book.bookId}
                  book={book}
                  index={idx}
                  total={rankableCount}
                  frozen={frozen}
                  chipsForBook={chipsForBook}
                  viewingUserId={viewingUserId}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  )
}

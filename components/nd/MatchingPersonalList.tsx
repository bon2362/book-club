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

interface Props {
  books: PersonalListBook[]
  frozen?: boolean
}

const interestLabel = (rank: number | null, readingStatus: string | null): string => {
  if (readingStatus === 'reading') return 'читается'
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

const labelColor = (rank: number | null, readingStatus: string | null): string => {
  if (readingStatus === 'reading') return '#888'
  if (rank === null) return '#bbb'
  if (rank <= 3) return '#4a7'
  return '#999'
}

interface SortableRowProps {
  book: PersonalListBook
  index: number
  total: number
  frozen: boolean
  onMoveUp: (bookId: string) => void
  onMoveDown: (bookId: string) => void
}

function SortableRow({ book, index, total, frozen, onMoveUp, onMoveDown }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen || book.readingStatus === 'reading',
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.4rem 0',
    borderBottom: '1px solid #f0f0f0',
    opacity: isDragging ? 0.5 : book.readingStatus === 'reading' ? 0.7 : 1,
    background: isDragging ? '#f9f9f9' : undefined,
    cursor: frozen || book.readingStatus === 'reading' ? 'default' : 'grab',
  }

  const canReorder = !frozen && book.readingStatus !== 'reading'

  return (
    <li ref={setNodeRef} style={style}>
      {canReorder && (
        <span
          {...attributes}
          {...listeners}
          aria-label={`Перетащить книгу ${book.title}`}
          style={{ fontSize: '0.75rem', color: '#ccc', cursor: 'grab', flexShrink: 0, userSelect: 'none' }}
        >
          ⠿
        </span>
      )}

      <span
        style={{
          fontFamily: 'var(--nd-mono), monospace',
          fontSize: '0.7rem',
          color: '#bbb',
          minWidth: 18,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {book.rank ?? '—'}
      </span>

      <div style={{ width: 32, height: 32, flexShrink: 0 }}>
        <CoverImage
          coverUrl={book.coverUrl}
          title={book.title}
          author={book.author}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--nd-mono), monospace',
            fontSize: '0.82rem',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {book.title}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#999' }}>{book.author}</div>
      </div>

      <span
        style={{
          fontFamily: 'var(--nd-mono), monospace',
          fontSize: '0.68rem',
          color: labelColor(book.rank, book.readingStatus),
          whiteSpace: 'nowrap',
        }}
      >
        {interestLabel(book.rank, book.readingStatus)}
      </span>

      {canReorder && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
          <button
            onClick={() => onMoveUp(book.bookId)}
            disabled={index === 0}
            aria-label={`Переместить ${book.title} выше`}
            style={{
              background: 'none',
              border: 'none',
              cursor: index === 0 ? 'default' : 'pointer',
              color: index === 0 ? '#ddd' : '#999',
              fontSize: '0.65rem',
              padding: '1px 3px',
              lineHeight: 1,
            }}
          >
            ▲
          </button>
          <button
            onClick={() => onMoveDown(book.bookId)}
            disabled={index === total - 1}
            aria-label={`Переместить ${book.title} ниже`}
            style={{
              background: 'none',
              border: 'none',
              cursor: index === total - 1 ? 'default' : 'pointer',
              color: index === total - 1 ? '#ddd' : '#999',
              fontSize: '0.65rem',
              padding: '1px 3px',
              lineHeight: 1,
            }}
          >
            ▼
          </button>
        </span>
      )}
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

export default function MatchingPersonalList({ books: initialBooks, frozen = false }: Props) {
  const [books, setBooks] = useState(initialBooks)
  const [announcement, setAnnouncement] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const applyNewOrder = useCallback(async (newBooks: PersonalListBook[]) => {
    const rankable = newBooks.filter(b => b.readingStatus !== 'reading')
    const ranked = rankable.map((b, i) => ({ ...b, rank: i + 1 }))
    const updated = newBooks.map(b => {
      const r = ranked.find(rb => rb.bookId === b.bookId)
      return r ?? b
    })
    setBooks(updated)
    await patchPriorities(rankable.map(b => b.bookId))
    return updated
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = books.findIndex(b => b.bookId === active.id)
    const newIndex = books.findIndex(b => b.bookId === over.id)
    const newBooks = arrayMove(books, oldIndex, newIndex)
    await applyNewOrder(newBooks)
    setAnnouncement(`Книга ${books[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${books.filter(b => b.readingStatus !== 'reading').length}`)
  }, [books, applyNewOrder])

  const handleMoveUp = useCallback(async (bookId: string) => {
    const index = books.findIndex(b => b.bookId === bookId)
    if (index <= 0) return
    const newBooks = arrayMove(books, index, index - 1)
    await applyNewOrder(newBooks)
    setAnnouncement(`Книга ${books[index].title} перемещена на позицию ${index} из ${books.filter(b => b.readingStatus !== 'reading').length}`)
  }, [books, applyNewOrder])

  const handleMoveDown = useCallback(async (bookId: string) => {
    const index = books.findIndex(b => b.bookId === bookId)
    if (index >= books.length - 1) return
    const newBooks = arrayMove(books, index, index + 1)
    await applyNewOrder(newBooks)
    setAnnouncement(`Книга ${books[index].title} перемещена на позицию ${index + 2} из ${books.filter(b => b.readingStatus !== 'reading').length}`)
  }, [books, applyNewOrder])

  if (books.length === 0) {
    return (
      <p style={{ color: '#999', fontSize: '0.8rem' }}>
        Вы ещё не добавили книги. Перейдите в каталог, чтобы выбрать книги для чтения.
      </p>
    )
  }

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="dnd-announcement"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {announcement}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={books.map(b => b.bookId)} strategy={verticalListSortingStrategy}>
          <ul
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            data-testid="matching-personal-list"
          >
            {books.map((book, idx) => (
              <SortableRow
                key={book.bookId}
                book={book}
                index={idx}
                total={books.filter(b => b.readingStatus !== 'reading').length}
                frozen={frozen}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  )
}

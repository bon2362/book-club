'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import MatchingBookDetailModal from './MatchingBookDetailModal'

// BookParticipant stays — used for chips in the popup
export interface BookParticipant {
  userId: string
  bookId: string
  pseudonym: string
  rank: number | null
  personalStatus: string | null
}

interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
  mutationUserId?: string
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
        <div className="relative overflow-hidden shrink-0" style={{ width: 44, height: 62, borderRadius: 0 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '0.9rem',
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
              marginBottom: '0.125rem',
            }}
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
        <div className="relative overflow-hidden shrink-0" style={{ width: 44, height: 62, borderRadius: 0 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '0.9rem',
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
              marginBottom: '0.125rem',
            }}
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
  onAdd: (bookId: string) => void
  frozen: boolean
}

function CatalogRow({ book, onClick, onAdd, frozen }: CatalogRowProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr) auto',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        cursor: 'pointer',
        background: hovered ? 'var(--bg-tag-green)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center pt-1">
        <span className="text-base leading-none" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>+</span>
      </div>
      <div className="flex gap-3 min-w-0">
        <div className="relative overflow-hidden shrink-0" style={{ width: 44, height: 62, borderRadius: 0 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '0.9rem',
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
              marginBottom: '0.125rem',
            }}
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
      {!frozen && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdd(book.bookId)
          }}
          style={{
            alignSelf: 'center',
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
            borderRadius: 0,
            border: '1px solid var(--border-strong)',
            background: 'var(--text)',
            color: 'var(--bg)',
            padding: '0.45rem 0.75rem',
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.08em',
            transition: 'opacity 120ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          Хочу читать
        </button>
      )}
    </li>
  )
}

function mutationUrl(path: string, mutationUserId?: string) {
  if (!mutationUserId) return path
  return `${path}?as=${encodeURIComponent(mutationUserId)}`
}

async function patchPriorities(bookIds: string[], mutationUserId?: string) {
  await fetch(mutationUrl('/api/matching/priorities', mutationUserId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookIds }),
  })
}

async function patchStatus(bookId: string, status: string | null, mutationUserId?: string) {
  await fetch(mutationUrl(`/api/signup-books/${bookId}/status`, mutationUserId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

async function addToList(bookId: string, mutationUserId?: string) {
  await fetch(mutationUrl('/api/matching/books', mutationUserId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookId }),
  })
}

async function removeFromList(bookId: string, mutationUserId?: string) {
  await fetch(mutationUrl(`/api/matching/books/${bookId}`, mutationUserId), { method: 'DELETE' })
}

export default function MatchingPersonalList({
  books: initialBooks,
  bookParticipants,
  viewingUserId,
  frozen = false,
  mutationUserId,
}: Props) {
  const router = useRouter()
  const [books, setBooks] = useState(initialBooks)
  const [announcement, setAnnouncement] = useState('')
  const [modalBook, setModalBook] = useState<CatalogBook | null>(null)

  useEffect(() => {
    setBooks(initialBooks)
    setModalBook((prev) => (
      prev ? initialBooks.find((book) => book.bookId === prev.bookId) ?? null : prev
    ))
  }, [initialBooks])

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
      reranked.filter((b) => b.isInList && b.personalStatus === null).map((b) => b.bookId),
      mutationUserId,
    )
    router.refresh()
    return reranked
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, mutationUserId])

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
        patchStatus(bookId, newStatus, mutationUserId),
        patchPriorities(rankedActive.map((b) => b.bookId), mutationUserId),
      ])
      router.refresh()
    },
    [books, router, mutationUserId],
  )

  const handleAddToList = useCallback(
    async (bookId: string) => {
      setBooks((prev) => {
        const target = prev.find((book) => book.bookId === bookId)
        if (!target) return prev
        const promoted = { ...target, isInList: true, personalStatus: null, rank: 1 }
        const rest = prev.filter((book) => book.bookId !== bookId)
        return rerank([promoted, ...rest])
      })
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, isInList: true, rank: 1 } : prev))
      await addToList(bookId, mutationUserId)
      router.refresh()
    },
    [router, mutationUserId],
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
      await removeFromList(bookId, mutationUserId)
      router.refresh()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, mutationUserId],
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
        <MatchingBookDetailModal
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

      <div className="grid h-full min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section data-testid="matching-catalog-available" className="flex flex-col min-h-0 border-r" style={{ borderColor: 'var(--border)' }}>
          <div
            className="px-4 py-2 border-b flex flex-col justify-center"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', minHeight: 54 }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Остальной каталог
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {catalogOnlyBooks.length > 0 ? (
              <ul className="list-none p-0 m-0">
                {catalogOnlyBooks.map((book) => (
                  <CatalogRow
                    key={book.bookId}
                    book={book}
                    onClick={setModalBook}
                    onAdd={handleAddToList}
                    frozen={frozen}
                  />
                ))}
              </ul>
            ) : (
              <EmptyColumn text="Все книги уже в вашем списке или статусах." />
            )}
          </div>
        </section>

        <section data-testid="matching-catalog-mine" className="flex flex-col min-h-0">
          <div
            className="px-4 py-2 border-b flex flex-col justify-center"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', minHeight: 54 }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide block"
              style={{ color: 'var(--text-muted)' }}
            >
              Мои книги
            </span>
            <span
              className="text-[10px] block mt-0.5"
              style={{ color: 'var(--text-muted)', opacity: 0.75 }}
            >
              активные книги участвуют в расчёте сценариев
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
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

            {activeBooks.length === 0 && statusBooks.length === 0 && (
              <EmptyColumn text="Здесь появятся книги, которые вы добавили." />
            )}
          </div>
        </section>
      </div>

    </>
  )
}

function EmptyColumn({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center" style={{ color: 'var(--text-muted)' }}>
      <p className="text-sm leading-relaxed m-0">{text}</p>
    </div>
  )
}

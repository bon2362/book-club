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

// ── Shared cover style ────────────────────────────────────────────────────────
const coverStyle: React.CSSProperties = {
  width: 40,
  height: 57,
  borderRadius: 3,
  flexShrink: 0,
  boxShadow: '0 1px 3px rgba(40,30,20,0.14)',
  position: 'relative',
  overflow: 'hidden',
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 300,
}

const panelHeadStyle: React.CSSProperties = {
  padding: '0.85rem 1.25rem 0.6rem',
  flexShrink: 0,
}

// ── Row base style ─────────────────────────────────────────────────────────────
const rowBase: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '30px 40px 1fr',
  gap: '0.75rem',
  padding: '0.6rem 0.75rem',
  alignItems: 'center',
  cursor: 'pointer',
}

// ── SortableRow ───────────────────────────────────────────────────────────────
interface SortableRowProps {
  book: CatalogBook
  index: number
  frozen: boolean
  isFirst: boolean
  onClick: (book: CatalogBook) => void
  onRemove: (bookId: string) => void
}

function SortableRow({ book, index, frozen, isFirst, onClick, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen,
  })

  return (
    <li
      ref={setNodeRef}
      className="nd-catalog-row"
      style={{
        ...rowBase,
        transform: CSS.Transform.toString(transform),
        transition,
        boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? '#FAF6EE' : undefined,
      }}
      onClick={() => onClick(book)}
    >
      {/* Rank + drag handle */}
      <div className="flex flex-col items-center gap-0.5">
        {book.rank != null && (
          <span
            style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1 }}
          >
            #{index + 1}
          </span>
        )}
        {!frozen && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Перетащить книгу ${book.title}`}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab select-none touch-none"
            style={{ color: 'var(--text-muted)', opacity: 0, fontSize: '0.8rem', background: 'none', border: 'none', padding: 0 }}
          >
            ⠿
          </button>
        )}
      </div>

      {/* Cover */}
      <div style={coverStyle}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>

      {/* Title + author */}
      <div className="min-w-0">
        <div
          style={{
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            marginBottom: '0.05rem',
          }}
        >
          {book.title}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
      </div>

      {/* «Убрать из списка» — absolute over row, appears on hover via CSS */}
      {!frozen && (
        <button
          type="button"
          className="nd-catalog-act"
          onClick={(e) => { e.stopPropagation(); onRemove(book.bookId) }}
          style={{
            background: 'var(--chip-bg)',
            color: 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            fontSize: '0.74rem',
            fontWeight: 600,
            padding: '0.4rem 0.8rem',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--hair)'; (e.target as HTMLElement).style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'var(--chip-bg)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)' }}
        >
          Убрать из списка
        </button>
      )}
    </li>
  )
}

// ── StatusRow ─────────────────────────────────────────────────────────────────
interface StatusRowProps {
  book: CatalogBook
  isFirst: boolean
  onClick: (book: CatalogBook) => void
}

function StatusRow({ book, isFirst, onClick }: StatusRowProps) {
  const statusIcon = book.personalStatus === 'reading' ? '📖' : '✓'
  return (
    <li
      className="nd-catalog-row"
      style={{ ...rowBase, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)', opacity: 0.7 }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center">
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{statusIcon}</span>
      </div>
      <div style={coverStyle}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>
      <div className="min-w-0">
        <div
          style={{
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            marginBottom: '0.05rem',
          }}
        >
          {book.title}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
      </div>
    </li>
  )
}

// ── CatalogRow ────────────────────────────────────────────────────────────────
interface CatalogRowProps {
  book: CatalogBook
  isFirst: boolean
  onClick: (book: CatalogBook) => void
  onAdd: (bookId: string) => void
  frozen: boolean
}

function CatalogRow({ book, isFirst, onClick, onAdd, frozen }: CatalogRowProps) {
  return (
    <li
      className="nd-catalog-row"
      style={{ ...rowBase, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)' }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center">
        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', opacity: 0.45 }}>+</span>
      </div>
      <div style={coverStyle}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>
      <div className="min-w-0">
        <div
          style={{
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            marginBottom: '0.05rem',
          }}
        >
          {book.title}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
      </div>

      {/* «Хочу читать» — absolute on hover */}
      {!frozen && (
        <button
          type="button"
          className="nd-catalog-act"
          onClick={(e) => { e.stopPropagation(); onAdd(book.bookId) }}
          style={{
            background: 'var(--accent)',
            color: 'var(--bg-input)',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            fontSize: '0.74rem',
            fontWeight: 600,
            padding: '0.4rem 0.8rem',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--accent-hover)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'var(--accent)' }}
        >
          Хочу читать
        </button>
      )}
    </li>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

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

      {/* ── Остальной каталог ── */}
      <section
        data-testid="matching-catalog-available"
        style={{ ...panelStyle, maxHeight: '60vh', overflow: 'hidden' }}
        className="flex flex-col"
      >
        <div style={panelHeadStyle}>
          <h3 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            Остальной каталог
          </h3>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Наведите на книгу и добавьте её в список
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 0.5rem 0.5rem' }}>
          {catalogOnlyBooks.length > 0 ? (
            <ul className="list-none p-0 m-0">
              {catalogOnlyBooks.map((book, idx) => (
                <CatalogRow
                  key={book.bookId}
                  book={book}
                  isFirst={idx === 0}
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

      {/* ── Мои книги ── */}
      <section
        data-testid="matching-catalog-mine"
        style={{ ...panelStyle, maxHeight: '60vh', overflow: 'hidden' }}
        className="flex flex-col"
      >
        <div style={panelHeadStyle}>
          <h3 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            Мои книги
          </h3>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Перетащите, чтобы задать приоритет
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 0.5rem' }}>
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
                      isFirst={idx === 0}
                      onClick={setModalBook}
                      onRemove={handleRemoveFromList}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {statusBooks.length > 0 && (
            <>
              {/* «В процессе / Прочитано» subheading — тёплый стиль */}
              <div style={{ padding: '0.65rem 0.75rem 0.4rem', borderTop: `1px solid var(--hair)${activeBooks.length > 0 ? '' : '; border-top:none'}` }}>
                <span style={{ fontFamily: 'var(--nd-serif)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  В процессе / Прочитано
                </span>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  исключены из расчёта сценариев
                </span>
              </div>
              <ul className="list-none p-0 m-0">
                {statusBooks.map((book, idx) => (
                  <StatusRow key={book.bookId} book={book} isFirst={idx === 0} onClick={setModalBook} />
                ))}
              </ul>
            </>
          )}

          {activeBooks.length === 0 && statusBooks.length === 0 && (
            <EmptyColumn text="Здесь появятся книги, которые вы добавили." />
          )}
        </div>
      </section>
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

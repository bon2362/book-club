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
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'
import CoverImage from './CoverImage'
import MatchingBookDetailModal from './MatchingBookDetailModal'
import { useMatchingBoard } from './MatchingBoardProvider'
import { useBookDetail } from './BookDetailProvider'
import { withAdminName } from './matching-shared'
import { addToList, patchPriorities, patchStatus, removeFromList } from '@/lib/matching/personal-list-mutations'

// BookParticipant stays — used for chips in the popup
export interface BookParticipant {
  ref: string
  bookId: string
  displayName: string
  rank: number | null
  personalStatus: string | null
}

interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
  mutationUserId?: string
  priorityMutationSource?: 'matching_priority_gate'
  suppressRefresh?: boolean
  onChange?: (activeRankingComplete: boolean) => void
  size?: 'compact' | 'large'
  fill?: boolean
  /** Карта displayName → name; задаётся только для админа (#341). Чипы участников книг получают «(Имя)». */
  adminNamesByDisplayName?: Map<string, string | null> | null
}

// ── Size-variant styles factory ───────────────────────────────────────────────
interface ListStyles {
  cover: React.CSSProperties
  row: React.CSSProperties
  title: React.CSSProperties
  author: React.CSSProperties
  rank: React.CSSProperties
  handle: React.CSSProperties
}

function getListStyles(size: 'compact' | 'large'): ListStyles {
  if (size === 'large') {
    return {
      cover: {
        width: 52,
        height: 74,
        borderRadius: 'var(--radius)',
        flexShrink: 0,
        boxShadow: 'var(--shadow-card)',
        position: 'relative',
        overflow: 'hidden',
      },
      row: {
        display: 'grid',
        gridTemplateColumns: '34px 52px 1fr',
        gap: '0.95rem',
        padding: '0.85rem 0.95rem',
        alignItems: 'center',
        cursor: 'pointer',
      },
      title: {
        fontFamily: 'var(--nd-serif)',
        fontWeight: 700,
        fontSize: '1.04rem',
        letterSpacing: '-0.01em',
        color: 'var(--text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        lineHeight: 1.25,
        marginBottom: '0.05rem',
      },
      author: {
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
      },
      rank: { fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1 },
      handle: { color: 'var(--text-muted)', fontSize: '1.1rem', background: 'none', border: 'none', padding: 0, lineHeight: 1 },
    }
  }
  // compact (default)
  return {
    cover: {
      width: 40,
      height: 57,
      borderRadius: 'var(--radius)',
      flexShrink: 0,
      boxShadow: 'var(--shadow-card)',
      position: 'relative',
      overflow: 'hidden',
    },
    row: {
      display: 'grid',
      gridTemplateColumns: '30px 40px 1fr',
      gap: '0.75rem',
      padding: '0.6rem 0.75rem',
      alignItems: 'center',
      cursor: 'pointer',
    },
    title: {
      fontFamily: 'var(--nd-serif)',
      fontWeight: 700,
      fontSize: '0.92rem',
      letterSpacing: '-0.01em',
      color: 'var(--text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
      lineHeight: 1.25,
      marginBottom: '0.05rem',
    },
    author: {
      fontSize: '0.76rem',
      color: 'var(--text-muted)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
    rank: { fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1 },
    handle: { color: 'var(--text-muted)', fontSize: '1rem', background: 'none', border: 'none', padding: 0, lineHeight: 1 },
  }
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

// ── Co-signups line ────────────────────────────────────────────────────────────
function CoSignups({ others, adminNamesByDisplayName = null }: { others: BookParticipant[]; adminNamesByDisplayName?: Map<string, string | null> | null }) {
  if (others.length === 0) return null
  const names = others.map((p) => withAdminName(p.displayName, adminNamesByDisplayName))
  return (
    <div
      style={{
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginTop: '0.12rem',
      }}
      title={`Тоже записались: ${names.join(', ')}`}
    >
      <span style={{ opacity: 0.7 }}>тоже записались: </span>
      <span style={{ color: 'var(--text-secondary)' }}>{names.join(' · ')}</span>
    </div>
  )
}

function sortActiveBooks(books: CatalogBook[]): CatalogBook[] {
  return [...books].sort((a, b) => {
    if (a.rank === null && b.rank !== null) return -1
    if (a.rank !== null && b.rank === null) return 1
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
    return a.title.localeCompare(b.title)
  })
}

// ── SortableRow ───────────────────────────────────────────────────────────────
interface SortableRowProps {
  book: CatalogBook
  frozen: boolean
  isFirst: boolean
  others: BookParticipant[]
  onClick: (book: CatalogBook) => void
  onRemove: (bookId: string) => void
  styles: ListStyles
  adminNamesByDisplayName?: Map<string, string | null> | null
}

function SortableRow({ book, frozen, isFirst, others, onClick, onRemove, styles: s, adminNamesByDisplayName = null }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen,
  })

  return (
    <li
      ref={setNodeRef}
      className="nd-catalog-row"
      style={{
        ...s.row,
        transform: CSS.Transform.toString(transform),
        transition,
        boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'var(--bg)' : undefined,
      }}
      onClick={() => onClick(book)}
    >
      {/* Rank + drag handle — расширенная зона захвата (весь первый столбец) */}
      <div
        {...(frozen ? {} : { ...attributes, ...listeners })}
        aria-label={frozen ? undefined : `Перетащить книгу ${book.title}`}
        onClick={(e) => e.stopPropagation()}
        className={'flex flex-col items-center gap-0.5 select-none touch-none' + (frozen ? '' : ' nd-drag-handle cursor-grab')}
        style={{ alignSelf: 'stretch', justifyContent: 'center' }}
      >
        {book.rank != null && (
          <span style={s.rank}>
            #{book.rank}
          </span>
        )}
        {!frozen && (
          <span style={s.handle} aria-hidden="true">
            ⠿
          </span>
        )}
      </div>

      {/* Cover */}
      <div data-testid="pl-cover" style={s.cover}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>

      {/* Title + author */}
      <div className="min-w-0">
        <div style={s.title}>
          {book.title}
        </div>
        <div style={s.author}>
          {book.author}
        </div>
        <CoSignups others={others} adminNamesByDisplayName={adminNamesByDisplayName} />
        {book.rank === null && (
          <div
            style={{
              marginTop: '0.28rem',
              paddingTop: '0.28rem',
              borderTop: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontSize: '0.68rem',
              lineHeight: 1.25,
              fontWeight: 700,
            }}
          >
            Книги без приоритета не участвуют в расчете
          </div>
        )}
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
  others: BookParticipant[]
  onClick: (book: CatalogBook) => void
  styles: ListStyles
  adminNamesByDisplayName?: Map<string, string | null> | null
}

function StatusRow({ book, isFirst, others, onClick, styles: s, adminNamesByDisplayName = null }: StatusRowProps) {
  const statusIcon = book.personalStatus === 'reading' ? '📖' : '✓'
  return (
    <li
      className="nd-catalog-row"
      style={{ ...s.row, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)', opacity: 0.7 }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center">
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{statusIcon}</span>
      </div>
      <div data-testid="pl-cover" style={s.cover}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>
      <div className="min-w-0">
        <div style={s.title}>
          {book.title}
        </div>
        <div style={s.author}>
          {book.author}
        </div>
        <CoSignups others={others} adminNamesByDisplayName={adminNamesByDisplayName} />
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
  styles: ListStyles
}

function CatalogRow({ book, isFirst, onClick, onAdd, frozen, styles: s }: CatalogRowProps) {
  return (
    <li
      className="nd-catalog-row"
      style={{ ...s.row, boxShadow: isFirst ? 'none' : 'inset 0 1px 0 var(--hair-soft)' }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center">
        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', opacity: 0.45 }}>+</span>
      </div>
      <div data-testid="pl-cover" style={s.cover}>
        <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
      </div>
      <div className="min-w-0">
        <div style={s.title}>
          {book.title}
        </div>
        <div style={s.author}>
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


// ── Main component ────────────────────────────────────────────────────────────

export default function MatchingPersonalList({
  books: initialBooks,
  bookParticipants,
  viewingUserId,
  frozen = false,
  mutationUserId,
  priorityMutationSource,
  suppressRefresh = false,
  onChange,
  size = 'compact',
  fill = false,
  adminNamesByDisplayName = null,
}: Props) {
  const s = getListStyles(size)
  const router = useRouter()
  const { beginPending, pending } = useMatchingBoard()
  const { openBook } = useBookDetail()
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

  const activeBooks = sortActiveBooks(books.filter((b) => b.isInList && b.personalStatus === null))
  const statusBooks = books.filter((b) => b.isInList && b.personalStatus !== null)
  const catalogOnlyBooks = books.filter((b) => !b.isInList)

  const othersFor = useCallback(
    (bookId: string) =>
      bookParticipants.filter((p) => p.bookId === bookId && p.ref !== viewingUserId),
    [bookParticipants, viewingUserId],
  )

  // Клик по книге: на доске открываем общий попап (BookDetailProvider), в gate-фазе
  // («Расставь приоритеты», suppressRefresh) — собственную модалку со своим потоком.
  const handleBookClick = useCallback(
    (book: CatalogBook) => {
      if (suppressRefresh) setModalBook(book)
      else openBook(book, othersFor(book.bookId))
    },
    [suppressRefresh, openBook, othersFor],
  )

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

  // Мгновенный отклик: зовём в МОМЕНТ жеста (до сетевого запроса), только на доске.
  // В gate-фазе (suppressRefresh) лоадера доски нет.
  const signalBusy = useCallback(() => {
    if (!suppressRefresh) beginPending()
  }, [suppressRefresh, beginPending])

  const notifyOrRefresh = useCallback((list: CatalogBook[]) => {
    if (suppressRefresh) {
      onChange?.(listHasCompleteActiveRanking(list))
      return
    }
    router.refresh()
  }, [onChange, router, suppressRefresh])

  const applyNewOrder = useCallback(async (newBooks: CatalogBook[]) => {
    const reranked = rerank(newBooks)
    setBooks(reranked)
    signalBusy()
    await patchPriorities(
      reranked.filter((b) => b.isInList && b.personalStatus === null).map((b) => b.bookId),
      mutationUserId,
      priorityMutationSource,
    )
    notifyOrRefresh(reranked)
    return reranked
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutationUserId, priorityMutationSource, notifyOrRefresh])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (pending) return // идёт пересчёт — реордер не принимаем
      const { active, over } = event
      if (!over || active.id === over.id) return
      const currentActive = sortActiveBooks(books.filter((b) => b.isInList && b.personalStatus === null))
      const oldIndex = currentActive.findIndex((b) => b.bookId === active.id)
      const newIndex = currentActive.findIndex((b) => b.bookId === over.id)
      const reorderedActive = arrayMove(currentActive, oldIndex, newIndex)
      const rest = books.filter((b) => !(b.isInList && b.personalStatus === null))
      await applyNewOrder([...reorderedActive, ...rest])
      setAnnouncement(
        `Книга ${currentActive[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder, pending],
  )

  const handleStatusChange = useCallback(
    async (bookId: string, newStatus: string | null) => {
      if (pending) return // идёт пересчёт — смену статуса не принимаем
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
      signalBusy()
      await Promise.all([
        patchStatus(bookId, newStatus, mutationUserId),
        patchPriorities(rankedActive.map((b) => b.bookId), mutationUserId, priorityMutationSource),
      ])
      notifyOrRefresh(merged)
    },
    [books, mutationUserId, priorityMutationSource, notifyOrRefresh, signalBusy, pending],
  )

  const handleAddToList = useCallback(
    async (bookId: string) => {
      if (pending) return // идёт пересчёт — добавление не принимаем
      const target = books.find((book) => book.bookId === bookId)
      if (!target) return
      const promoted = { ...target, isInList: true, personalStatus: null, rank: 1 }
      const rest = books.filter((book) => book.bookId !== bookId)
      const nextBooks = rerank([promoted, ...rest])
      setBooks(nextBooks)
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, isInList: true, rank: 1 } : prev))
      signalBusy()
      await addToList(bookId, mutationUserId)
      notifyOrRefresh(nextBooks)
    },
    [books, mutationUserId, notifyOrRefresh, signalBusy, pending],
  )

  const handleRemoveFromList = useCallback(
    async (bookId: string) => {
      if (pending) return // идёт пересчёт — удаление не принимаем
      const nextBooks = rerank(books.map((b) =>
        b.bookId === bookId ? { ...b, isInList: false, rank: null, personalStatus: null } : b,
      ))
      setBooks(nextBooks)
      setModalBook((prev) =>
        prev?.bookId === bookId ? { ...prev, isInList: false, rank: null, personalStatus: null } : prev,
      )
      signalBusy()
      await removeFromList(bookId, mutationUserId)
      notifyOrRefresh(nextBooks)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [books, mutationUserId, notifyOrRefresh, signalBusy, pending],
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
          adminNamesByDisplayName={adminNamesByDisplayName}
          onClose={() => setModalBook(null)}
          onStatusChange={handleStatusChange}
          onAddToList={handleAddToList}
          onRemoveFromList={handleRemoveFromList}
        />
      )}

      {/* ── Остальной каталог ── */}
      <section
        data-testid="matching-catalog-available"
        style={{ ...panelStyle, overflow: 'hidden', ...(fill ? { minHeight: 0 } : { maxHeight: '80vh' }), opacity: pending ? 0.6 : 1, transition: 'opacity 0.2s ease' }}
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
                  onClick={handleBookClick}
                  onAdd={handleAddToList}
                  frozen={frozen}
                  styles={s}
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
        style={{ ...panelStyle, overflow: 'hidden', ...(fill ? { minHeight: 0 } : { maxHeight: '80vh' }), opacity: pending ? 0.6 : 1, transition: 'opacity 0.2s ease' }}
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
                <ul
                  className="list-none p-0 m-0"
                  data-testid="pl-books-ul"
                  style={fill ? { overflowY: 'auto', flex: 1, minHeight: 0 } : undefined}
                >
                  {activeBooks.map((book, idx) => (
                    <SortableRow
                      key={book.bookId}
                      book={book}
                      frozen={frozen}
                      isFirst={idx === 0}
                      others={othersFor(book.bookId)}
                      onClick={handleBookClick}
                      onRemove={handleRemoveFromList}
                      styles={s}
                      adminNamesByDisplayName={adminNamesByDisplayName}
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
                  <StatusRow key={book.bookId} book={book} isFirst={idx === 0} others={othersFor(book.bookId)} onClick={handleBookClick} styles={s} adminNamesByDisplayName={adminNamesByDisplayName} />
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

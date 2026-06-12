'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { addToList, patchPriorities, patchStatus, removeFromList } from '@/lib/matching/personal-list-mutations'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import type { BookParticipant } from './MatchingPersonalList'
import { useMatchingBoard } from './MatchingBoardProvider'

interface BookDetailContextValue {
  openBook: (book: MatchingBookDetail, chips: BookParticipant[]) => void
}

const defaultValue: BookDetailContextValue = { openBook: () => {} }
const BookDetailContext = createContext<BookDetailContextValue>(defaultValue)

export function useBookDetail(): BookDetailContextValue {
  return useContext(BookDetailContext)
}

interface Props {
  /** Текущий снимок личного списка смотрящего — источник isInList/personalStatus/rank. */
  personalBooks: CatalogBook[]
  viewingUserId: string
  mutationUserId?: string
  frozen?: boolean
  adminNamesByPseudonym?: Map<string, string | null> | null
  children: React.ReactNode
}

/**
 * Единственный книжный попап на доске матчинга (#341/рефактор): «Сценарии кругов»,
 * «Мои ходы» и «Мои книги» зовут `openBook(...)`, а модалка рендерится здесь один раз.
 * Контролы (статус / добавить / убрать) появляются по данным книги: модалка обогащается
 * персональным `isInList`/`personalStatus` смотрящего из `personalBooks`.
 *
 * Только для board-фазы. На gate-экране «Расставь приоритеты» провайдер не монтируется —
 * там MatchingPersonalList держит собственную модалку с suppressRefresh-потоком.
 */
export default function BookDetailProvider({
  personalBooks,
  viewingUserId,
  mutationUserId,
  frozen = false,
  adminNamesByPseudonym = null,
  children,
}: Props) {
  const router = useRouter()
  const { beginPending } = useMatchingBoard()
  const [open, setOpen] = useState<{ book: MatchingBookDetail; chips: BookParticipant[] } | null>(null)

  const openBook = useCallback((book: MatchingBookDetail, chips: BookParticipant[]) => {
    setOpen({ book, chips })
  }, [])

  const closeBook = useCallback(() => setOpen(null), [])

  const handleAddToList = useCallback(async (bookId: string) => {
    beginPending()
    await addToList(bookId, mutationUserId)
    router.refresh()
  }, [beginPending, mutationUserId, router])

  const handleRemoveFromList = useCallback(async (bookId: string) => {
    beginPending()
    await removeFromList(bookId, mutationUserId)
    router.refresh()
  }, [beginPending, mutationUserId, router])

  const handleStatusChange = useCallback(async (bookId: string, newStatus: string | null) => {
    // Сервер не ренормализует ранги при смене статуса — добиваем priorities, чтобы avgRank
    // не «поплыл» (книга со статусом выпадает из активного ранжирования).
    const rankedActiveIds = personalBooks
      .map((b) => (b.bookId === bookId ? { ...b, personalStatus: newStatus } : b))
      .filter((b) => b.isInList && b.personalStatus === null && b.rank !== null)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((b) => b.bookId)
    beginPending()
    await Promise.all([
      patchStatus(bookId, newStatus, mutationUserId),
      patchPriorities(rankedActiveIds, mutationUserId),
    ])
    router.refresh()
  }, [beginPending, mutationUserId, personalBooks, router])

  // Обогащаем открытую книгу персональными данными смотрящего → контролы по данным.
  const personal = open ? personalBooks.find((b) => b.bookId === open.book.bookId) : null
  const enrichedBook: MatchingBookDetail | null = open
    ? { ...open.book, isInList: personal?.isInList ?? false, personalStatus: personal?.personalStatus ?? null }
    : null

  return (
    <BookDetailContext.Provider value={{ openBook }}>
      {children}
      {open && enrichedBook && (
        <MatchingBookDetailModal
          book={enrichedBook}
          chips={open.chips}
          viewingUserId={viewingUserId}
          frozen={frozen}
          onClose={closeBook}
          onStatusChange={handleStatusChange}
          onAddToList={handleAddToList}
          onRemoveFromList={handleRemoveFromList}
          adminNamesByPseudonym={adminNamesByPseudonym}
        />
      )}
    </BookDetailContext.Provider>
  )
}

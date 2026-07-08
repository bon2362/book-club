export type RankSource = 'auto' | 'manual'

export interface RankedBook {
  bookId: string
  rank: number
}

export interface RankAssignment {
  bookId: string
  rank: number
  source: RankSource
}

/** Следующий ранг при добавлении книги в конец списка. */
export function nextRank(existing: RankedBook[]): number {
  return existing.reduce((max, row) => Math.max(max, row.rank), 0) + 1
}

/** Переиндексация 1..N по возрастанию текущего ранга (после удаления). */
export function compactRanks(existing: RankedBook[]): RankedBook[] {
  return [...existing]
    .sort((a, b) => a.rank - b.rank)
    .map((row, index) => ({ bookId: row.bookId, rank: index + 1 }))
}

/** Явное упорядочивание: ранг = позиция, источник manual. */
export function manualOrder(bookIds: string[]): RankAssignment[] {
  return bookIds.map((bookId, index) => ({ bookId, rank: index + 1, source: 'manual' }))
}

/** Бэкфилл одного пользователя: существующие ранги → manual, нератированные → auto в конец. */
export function planBackfill(ranked: RankedBook[], unrankedInOrder: string[]): RankAssignment[] {
  const kept = compactRanks(ranked).map((row): RankAssignment => ({ ...row, source: 'manual' }))
  const appended = unrankedInOrder.map((bookId, index): RankAssignment => ({
    bookId,
    rank: kept.length + index + 1,
    source: 'auto',
  }))
  return [...kept, ...appended]
}

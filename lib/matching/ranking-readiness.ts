type ActiveSignup = {
  userId: string
  bookId: string
}

type RankRow = {
  userId: string
  bookId: string
  rank: number | null
}

function key(userId: string, bookId: string) {
  return `${userId}\u0000${bookId}`
}

export function userNeedsRankingGate(
  userId: string,
  activeSignups: ActiveSignup[],
  ranks: RankRow[],
) {
  const userActiveSignups = activeSignups.filter((signup) => signup.userId === userId)
  const ranked = new Set(
    ranks
      .filter((rank) => rank.rank !== null)
      .map((rank) => key(rank.userId, rank.bookId)),
  )

  return userActiveSignups.some((signup) => !ranked.has(key(signup.userId, signup.bookId)))
}

export function listNeedsRankingGate(
  books: { isInList: boolean; personalStatus: string | null; rank: number | null }[],
) {
  return books.some(
    (book) => book.isInList && book.personalStatus === null && book.rank === null,
  )
}

export function userHasCompleteActiveRanking(
  userId: string,
  activeSignups: ActiveSignup[],
  ranks: RankRow[],
) {
  return !userNeedsRankingGate(userId, activeSignups, ranks)
}

export function listHasCompleteActiveRanking(
  books: { isInList: boolean; personalStatus: string | null; rank: number | null }[],
) {
  return !listNeedsRankingGate(books)
}

/**
 * Можно войти в сессию, только если у пользователя есть хотя бы одна активная
 * книга и все активные книги проранжированы. Пустой список не пускает в сессию
 * через gate (доска для пустого списка открывается отдельным путём, минуя gate).
 */
export function listCanEnterSession(
  books: { isInList: boolean; personalStatus: string | null; rank: number | null }[],
) {
  const active = books.filter((book) => book.isInList && book.personalStatus === null)
  return active.length > 0 && active.every((book) => book.rank !== null)
}

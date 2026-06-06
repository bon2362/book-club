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

export function userHasCompleteActiveRanking(
  userId: string,
  activeSignups: ActiveSignup[],
  ranks: RankRow[],
) {
  const userActiveSignups = activeSignups.filter((signup) => signup.userId === userId)
  if (userActiveSignups.length === 0) return false

  const ranked = new Set(
    ranks
      .filter((rank) => rank.rank !== null)
      .map((rank) => key(rank.userId, rank.bookId)),
  )

  return userActiveSignups.every((signup) => ranked.has(key(signup.userId, signup.bookId)))
}

export function listHasCompleteActiveRanking(
  books: { isInList: boolean; personalStatus: string | null; rank: number | null }[],
) {
  const activeBooks = books.filter((book) => book.isInList && book.personalStatus === null)
  return activeBooks.length > 0 && activeBooks.every((book) => book.rank !== null)
}

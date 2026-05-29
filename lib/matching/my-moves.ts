import { db } from '@/lib/db'
import { signupBooks, books, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and, inArray, notInArray, isNull } from 'drizzle-orm'

export interface MyMoveBook {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  existingParticipants: { userId: string; pseudonym: string }[]
}

export async function fetchMyMoves(
  userId: string,
  sessionId: string,
  targetGroupSize: number,
): Promise<MyMoveBook[]> {
  // Get all session participants except current user
  const otherParticipants = await db
    .select({ userId: matchingSessionParticipants.userId, pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        notInArray(matchingSessionParticipants.userId, [userId]),
      ),
    )

  if (otherParticipants.length < targetGroupSize - 1) return []

  const otherUserIds = otherParticipants.map(p => p.userId)

  // Get books current user has NOT signed up for
  const mySignups = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(eq(signupBooks.userId, userId))
  const myBookIds = mySignups.map(s => s.bookId)

  // Get signups from other participants for books the current user hasn't joined.
  // Exclude signups with a personal_status set (reading/read) — those users are no longer
  // available as matching candidates for a new group on that book.
  const otherSignups = myBookIds.length > 0
    ? await db
        .select({ userId: signupBooks.userId, bookId: signupBooks.bookId })
        .from(signupBooks)
        .where(
          and(
            inArray(signupBooks.userId, otherUserIds),
            notInArray(signupBooks.bookId, myBookIds),
            isNull(signupBooks.personalStatus),
          ),
        )
    : await db
        .select({ userId: signupBooks.userId, bookId: signupBooks.bookId })
        .from(signupBooks)
        .where(
          and(
            inArray(signupBooks.userId, otherUserIds),
            isNull(signupBooks.personalStatus),
          ),
        )

  // Group by bookId: find books with exactly targetGroupSize-1 other participants signed up
  const countByBook = new Map<string, string[]>()
  for (const s of otherSignups) {
    const arr = countByBook.get(s.bookId) ?? []
    arr.push(s.userId)
    countByBook.set(s.bookId, arr)
  }

  const qualifyingBookIds: string[] = []
  for (const [bookId, userIds] of Array.from(countByBook.entries())) {
    if (userIds.length === targetGroupSize - 1) qualifyingBookIds.push(bookId)
  }

  if (qualifyingBookIds.length === 0) return []

  const bookDetails = await db
    .select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl })
    .from(books)
    .where(and(inArray(books.id, qualifyingBookIds), eq(books.visibility, 'published')))

  const pseudonymMap = new Map(otherParticipants.map(p => [p.userId, p.pseudonym]))

  return bookDetails.map(book => ({
    bookId: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl ?? null,
    existingParticipants: (countByBook.get(book.id) ?? []).map(uid => ({
      userId: uid,
      pseudonym: pseudonymMap.get(uid) ?? uid,
    })),
  }))
}

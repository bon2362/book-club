import { db } from '@/lib/db'
import { signupBooks, books, matchingSessionParticipants, bookPriorities } from '@/lib/db/schema'
import { eq, and, inArray, notInArray, isNull } from 'drizzle-orm'
import type { GroupMember, MatchingScenario } from './scenarios'

export interface MyMoveBook {
  bookId: string
  title: string
  author: string
  description: string
  coverUrl: string | null
  pages: number | null
  publishedDate: string
  textUrl: string
  whyRead: string | null
  recommendationLink: string | null
  tags: string[]
  existingParticipants: { userId: string; pseudonym: string; rank: number | null }[]
  impact?: {
    scenarioId: string | null
    scenarioTitle: string
    coverageLabel: string
    summary: string
    circleTitles: string[]
    circleBooks: { bookId: string; title: string }[]
    previewScenario: MatchingScenario
    coverage: { before: number; after: number }
    strongInterest: { before: number; after: number }
    beneficiaries: {
      userId: string
      pseudonym: string
      before:
        | { place: 'leftOut' }
        | { place: 'circle'; bookTitle: string; interest: GroupMember['interest'] }
      after: GroupMember['interest']
    }[]
  }
}

export async function fetchMyMoves(
  userId: string,
  sessionId: string,
  minGroupSize: number,
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

  if (otherParticipants.length < minGroupSize - 1) return []

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
        .select({ userId: signupBooks.userId, bookId: signupBooks.bookId, rank: bookPriorities.rank })
        .from(signupBooks)
        .leftJoin(
          bookPriorities,
          and(
            eq(bookPriorities.userId, signupBooks.userId),
            eq(bookPriorities.bookId, signupBooks.bookId),
          ),
        )
        .where(
          and(
            inArray(signupBooks.userId, otherUserIds),
            notInArray(signupBooks.bookId, myBookIds),
            isNull(signupBooks.personalStatus),
          ),
        )
    : await db
        .select({ userId: signupBooks.userId, bookId: signupBooks.bookId, rank: bookPriorities.rank })
        .from(signupBooks)
        .leftJoin(
          bookPriorities,
          and(
            eq(bookPriorities.userId, signupBooks.userId),
            eq(bookPriorities.bookId, signupBooks.bookId),
          ),
        )
        .where(
          and(
            inArray(signupBooks.userId, otherUserIds),
            isNull(signupBooks.personalStatus),
          ),
        )

  // Group by bookId: prefilter books with enough other participants for the
  // current user to make at least one valid circle. Scenario simulation later
  // decides whether adding the book actually changes the leader scenario.
  const countByBook = new Map<string, { userId: string; rank: number | null }[]>()
  for (const s of otherSignups) {
    const arr = countByBook.get(s.bookId) ?? []
    arr.push({ userId: s.userId, rank: s.rank ?? null })
    countByBook.set(s.bookId, arr)
  }

  const qualifyingBookIds: string[] = []
  for (const [bookId, userIds] of Array.from(countByBook.entries())) {
    if (userIds.length >= minGroupSize - 1) qualifyingBookIds.push(bookId)
  }

  if (qualifyingBookIds.length === 0) return []

  const bookDetails = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      coverUrl: books.coverUrl,
      pages: books.pages,
      publishedDate: books.publishedDate,
      textUrl: books.textUrl,
      whyRead: books.whyRead,
      recommendationLink: books.recommendationLink,
      tags: books.tags,
    })
    .from(books)
    .where(and(inArray(books.id, qualifyingBookIds), eq(books.visibility, 'published')))

  const pseudonymMap = new Map(otherParticipants.map(p => [p.userId, p.pseudonym]))

  return bookDetails.map(book => ({
    bookId: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    coverUrl: book.coverUrl ?? null,
    pages: book.pages,
    publishedDate: book.publishedDate,
    textUrl: book.textUrl,
    whyRead: book.whyRead,
    recommendationLink: book.recommendationLink,
    tags: Array.isArray(book.tags) ? book.tags : [],
    existingParticipants: (countByBook.get(book.id) ?? []).map(({ userId: uid, rank }) => ({
      userId: uid,
      pseudonym: pseudonymMap.get(uid) ?? uid,
      rank,
    })),
  }))
}

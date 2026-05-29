import { db } from '@/lib/db'
import { signupBooks, bookPriorities, books } from '@/lib/db/schema'
import { eq, and, asc, sql } from 'drizzle-orm'

export interface PersonalListBook {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  readingStatus: string | null
  rank: number | null
  personalStatus: string | null
}

export async function fetchPersonalList(userId: string): Promise<PersonalListBook[]> {
  const rows = await db
    .select({
      bookId: signupBooks.bookId,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      readingStatus: books.readingStatus,
      rank: bookPriorities.rank,
      personalStatus: signupBooks.personalStatus,
    })
    .from(signupBooks)
    .innerJoin(books, eq(books.id, signupBooks.bookId))
    .leftJoin(
      bookPriorities,
      and(
        eq(bookPriorities.userId, signupBooks.userId),
        eq(bookPriorities.bookId, signupBooks.bookId),
      ),
    )
    .where(
      and(
        eq(signupBooks.userId, userId),
        eq(books.visibility, 'published'),
      ),
    )
    .orderBy(
      sql`${bookPriorities.rank} ASC NULLS LAST`,
      asc(books.title),
    )

  return rows
}

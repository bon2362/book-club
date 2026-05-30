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

export interface CatalogBook {
  bookId: string
  title: string
  author: string
  description: string
  coverUrl: string | null
  pages: number | null
  publishedDate: string
  rank: number | null
  personalStatus: string | null
  isInList: boolean
}

export async function fetchCatalogWithPersonalData(userId: string): Promise<CatalogBook[]> {
  const rows = await db
    .select({
      bookId: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      coverUrl: books.coverUrl,
      pages: books.pages,
      publishedDate: books.publishedDate,
      rank: bookPriorities.rank,
      personalStatus: signupBooks.personalStatus,
      signupBookId: signupBooks.bookId,
    })
    .from(books)
    .leftJoin(
      signupBooks,
      and(eq(signupBooks.bookId, books.id), eq(signupBooks.userId, userId)),
    )
    .leftJoin(
      bookPriorities,
      and(eq(bookPriorities.bookId, books.id), eq(bookPriorities.userId, userId)),
    )
    .where(eq(books.visibility, 'published'))
    .orderBy(
      sql`${bookPriorities.rank} ASC NULLS LAST`,
      asc(books.sortOrder),
      asc(books.title),
    )

  return rows.map((row) => ({
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.coverUrl,
    pages: row.pages,
    publishedDate: row.publishedDate,
    rank: row.rank,
    personalStatus: row.personalStatus,
    isInList: row.signupBookId !== null,
  }))
}

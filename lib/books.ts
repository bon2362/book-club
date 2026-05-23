import { db } from '@/lib/db'
import { books, signupBooks } from '@/lib/db/schema'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'

export interface BookWithCover {
  id: string
  name: string
  tags: string[]
  author: string
  type: string
  size: string
  pages: string
  date: string
  link: string
  description: string
  coverUrl: string | null
  whyRead: string | null
  recommendationLink: string | null
  isNew: boolean
  status?: 'reading' | 'read' | null
  signupCount?: number
  submittedByMember?: boolean
  visibility?: 'hidden' | 'published'
  source?: 'admin' | 'submission' | 'sheets_import'
  archived?: boolean
  sortOrder?: number
}

// Test fixtures used to live in this file and were auto-seeded on every read in
// NEXTAUTH_TEST_MODE, but that wrote into the production database whenever CI ran.
// Fixture lifecycle now belongs to the E2E suite — see e2e/global-setup.ts and
// the /api/test/seed-books endpoint.

function rowToBook(row: typeof books.$inferSelect, signupCount = 0): BookWithCover {
  return {
    id: row.id,
    name: row.title,
    tags: Array.isArray(row.tags) ? row.tags : [],
    author: row.author,
    type: row.type === 'article' ? 'Article' : 'Book',
    size: row.size,
    pages: row.pages != null ? String(row.pages) : '',
    date: row.publishedDate,
    link: row.textUrl,
    description: row.description,
    coverUrl: row.coverUrl,
    whyRead: row.whyRead,
    recommendationLink: row.recommendationLink,
    isNew: row.isNew,
    status: (row.readingStatus as 'reading' | 'read' | null) ?? null,
    visibility: row.visibility as 'hidden' | 'published',
    source: row.source as 'admin' | 'submission' | 'sheets_import',
    submittedByMember: row.source === 'submission',
    archived: row.archivedAt != null,
    sortOrder: row.sortOrder,
    signupCount,
  }
}

interface ListOptions {
  includeHidden?: boolean
  includeArchived?: boolean
}

async function loadBooks(options: ListOptions = {}): Promise<BookWithCover[]> {
  const { includeHidden = false, includeArchived = false } = options
  const conditions = []
  if (!includeHidden) conditions.push(eq(books.visibility, 'published'))
  if (!includeArchived) conditions.push(isNull(books.archivedAt))
  const whereClause = conditions.length ? and(...conditions) : undefined

  const rows = await db
    .select()
    .from(books)
    .where(whereClause as never)
    .orderBy(asc(books.sortOrder), desc(books.publishedAt))

  // signup counts in a single grouped query (joins both legacy book_name and new book_id rows).
  const countsByBookId = await db
    .select({ bookId: signupBooks.bookId, count: sql<number>`count(*)::int` })
    .from(signupBooks)
    .where(isNotNull(signupBooks.bookId))
    .groupBy(signupBooks.bookId)

  const countsByName = await db
    .select({ bookName: signupBooks.bookName, count: sql<number>`count(*)::int` })
    .from(signupBooks)
    .where(isNull(signupBooks.bookId))
    .groupBy(signupBooks.bookName)

  const countById = new Map(countsByBookId.map(c => [c.bookId ?? '', Number(c.count)]))
  const countByName = new Map(countsByName.map(c => [c.bookName, Number(c.count)]))

  return rows.map(row => {
    const cnt = (countById.get(row.id) ?? 0) + (countByName.get(row.title) ?? 0)
    return rowToBook(row, cnt)
  })
}

export async function fetchBooksWithCovers(): Promise<BookWithCover[]> {
  return loadBooks({ includeHidden: false, includeArchived: false })
}

export async function fetchBooksForAdmin(): Promise<BookWithCover[]> {
  return loadBooks({ includeHidden: true, includeArchived: false })
}

export async function fetchBookById(id: string): Promise<BookWithCover | null> {
  const [row] = await db.select().from(books).where(eq(books.id, id)).limit(1)
  return row ? rowToBook(row) : null
}

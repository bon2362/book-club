import { db } from '@/lib/db'
import { books, signupBooks } from '@/lib/db/schema'
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

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

// E2E fixtures — ensured to exist in the `books` table when NEXTAUTH_TEST_MODE is on.
// Inserting them as real rows means /api/admin/book-status and friends work uniformly
// for fixture books and prod books (no separate "is this fixture" code path needed).
const TEST_FIXTURE_BOOKS = [
  { id: '__test_book_1__', title: 'Тестовая книга 1', author: 'Test Author A', tags: ['государство'], description: 'Книга для e2e-тестов', pages: 100, publishedDate: '2024' },
  { id: '__test_book_2__', title: 'Тестовая книга 2', author: 'Test Author B', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 200, publishedDate: '2024' },
  { id: '__test_book_3__', title: 'Тестовая книга 3', author: 'Test Author C', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 300, publishedDate: '2024' },
]

let fixturesSeeded = false
async function ensureTestFixturesPresent(): Promise<void> {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return
  if (fixturesSeeded) return
  fixturesSeeded = true
  try {
    const existing = await db
      .select({ id: books.id })
      .from(books)
      .where(inArray(books.id, TEST_FIXTURE_BOOKS.map(b => b.id)))
    const existingIds = new Set(existing.map(r => r.id))
    const missing = TEST_FIXTURE_BOOKS.filter(b => !existingIds.has(b.id))
    if (missing.length > 0) {
      await db.insert(books).values(missing.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        tags: b.tags,
        type: 'book',
        size: '',
        pages: b.pages,
        publishedDate: b.publishedDate,
        textUrl: '',
        description: b.description,
        coverUrl: null,
        whyRead: null,
        recommendationLink: null,
        readingStatus: null,
        visibility: 'published' as const,
        isNew: false,
        sortOrder: -100,
        source: 'admin' as const,
        sourceSubmissionId: null,
        legacySheetsRowId: null,
      }))).onConflictDoNothing()
    }
  } catch (err) {
    // Don't crash the catalog if seeding the test fixtures fails — log only.
    // eslint-disable-next-line no-console
    console.warn('ensureTestFixturesPresent failed:', err)
    fixturesSeeded = false
  }
}

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
  await ensureTestFixturesPresent()
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
  await ensureTestFixturesPresent()
  const [row] = await db.select().from(books).where(eq(books.id, id)).limit(1)
  return row ? rowToBook(row) : null
}

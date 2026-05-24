import { db } from '@/lib/db'
import { books, signupBooks } from '@/lib/db/schema'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import crypto from 'node:crypto'

export const ALLOWED_VISIBILITIES = ['hidden', 'published'] as const
export const ALLOWED_READING_STATUSES = ['reading', 'read'] as const
export const ALLOWED_TYPES = ['book', 'article'] as const

export type Visibility = (typeof ALLOWED_VISIBILITIES)[number]
export type ReadingStatus = (typeof ALLOWED_READING_STATUSES)[number]
export type BookType = (typeof ALLOWED_TYPES)[number]

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

  // Signup counts grouped by book_id. After Stage 3 finalize, every signup row
  // has a non-null book_id (PK).
  const countsByBookId = await db
    .select({ bookId: signupBooks.bookId, count: sql<number>`count(*)::int` })
    .from(signupBooks)
    .groupBy(signupBooks.bookId)

  const countById = new Map(countsByBookId.map(c => [c.bookId, Number(c.count)]))

  const safeRows = process.env.NODE_ENV === 'production'
    ? rows.filter(row => !row.id.startsWith('__test_book_') && !row.title.startsWith('E2E '))
    : rows

  return safeRows.map(row => rowToBook(row, countById.get(row.id) ?? 0))
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

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(t => String(t).trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input.split(',').map(t => t.trim()).filter(Boolean)
  }
  return []
}

function normalizePages(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const n = typeof input === 'number' ? input : parseInt(String(input), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export class BookValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookValidationError'
  }
}

export interface CreateBookInput {
  title: string
  author?: string
  tags?: unknown
  type?: unknown
  size?: string
  pages?: unknown
  publishedDate?: string
  textUrl?: string
  description?: string
  coverUrl?: string | null
  whyRead?: string | null
  recommendationLink?: string | null
  readingStatus?: unknown
  visibility?: unknown
  isNew?: boolean
  sortOrder?: number
}

export async function createBook(input: CreateBookInput): Promise<BookWithCover> {
  const title = (input.title ?? '').trim()
  if (!title) throw new BookValidationError('title is required')

  const author = (input.author ?? '').trim()
  const type: BookType = ALLOWED_TYPES.includes(input.type as BookType)
    ? (input.type as BookType)
    : 'book'
  const visibility: Visibility = ALLOWED_VISIBILITIES.includes(input.visibility as Visibility)
    ? (input.visibility as Visibility)
    : 'hidden'
  const readingStatus = input.readingStatus == null || input.readingStatus === ''
    ? null
    : ALLOWED_READING_STATUSES.includes(input.readingStatus as ReadingStatus)
      ? (input.readingStatus as ReadingStatus)
      : null

  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(books).values({
    id,
    title,
    author,
    tags: normalizeTags(input.tags),
    type,
    size: input.size ?? '',
    pages: normalizePages(input.pages),
    publishedDate: input.publishedDate ?? '',
    textUrl: input.textUrl ?? '',
    description: input.description ?? '',
    coverUrl: input.coverUrl ?? null,
    whyRead: input.whyRead ?? null,
    recommendationLink: input.recommendationLink ?? null,
    readingStatus,
    visibility,
    isNew: input.isNew ?? false,
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
    source: 'admin',
    createdAt: now,
    updatedAt: now,
    publishedAt: visibility === 'published' ? now : null,
    hiddenAt: visibility === 'hidden' ? now : null,
  })

  const created = await fetchBookById(id)
  if (!created) throw new Error('Failed to load created book')
  return created
}

export interface UpdateBookInput {
  title?: string
  author?: string
  tags?: unknown
  type?: unknown
  size?: string
  pages?: unknown
  publishedDate?: string
  textUrl?: string
  description?: string
  coverUrl?: string | null
  whyRead?: string | null
  recommendationLink?: string | null
  readingStatus?: unknown
  visibility?: unknown
  isNew?: boolean
  sortOrder?: number
  archived?: boolean
}

export async function updateBook(id: string, input: UpdateBookInput): Promise<BookWithCover | null> {
  const [current] = await db.select().from(books).where(eq(books.id, id)).limit(1)
  if (!current) return null

  const patch: Partial<typeof books.$inferInsert> = { updatedAt: new Date() }

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) throw new BookValidationError('title cannot be empty')
    patch.title = title
  }
  if (input.author !== undefined) patch.author = input.author.trim()
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags)
  if (input.type !== undefined) {
    if (!ALLOWED_TYPES.includes(input.type as BookType)) {
      throw new BookValidationError(`invalid type: ${String(input.type)}`)
    }
    patch.type = input.type as BookType
  }
  if (input.size !== undefined) patch.size = input.size
  if (input.pages !== undefined) patch.pages = normalizePages(input.pages)
  if (input.publishedDate !== undefined) patch.publishedDate = input.publishedDate
  if (input.textUrl !== undefined) patch.textUrl = input.textUrl
  if (input.description !== undefined) patch.description = input.description
  if (input.coverUrl !== undefined) patch.coverUrl = input.coverUrl
  if (input.whyRead !== undefined) patch.whyRead = input.whyRead
  if (input.recommendationLink !== undefined) patch.recommendationLink = input.recommendationLink
  if (input.readingStatus !== undefined) {
    if (input.readingStatus === null || input.readingStatus === '') {
      patch.readingStatus = null
    } else if (ALLOWED_READING_STATUSES.includes(input.readingStatus as ReadingStatus)) {
      patch.readingStatus = input.readingStatus as ReadingStatus
    } else {
      throw new BookValidationError(`invalid reading_status: ${String(input.readingStatus)}`)
    }
  }
  if (input.visibility !== undefined) {
    if (!ALLOWED_VISIBILITIES.includes(input.visibility as Visibility)) {
      throw new BookValidationError(`invalid visibility: ${String(input.visibility)}`)
    }
    const nextVisibility = input.visibility as Visibility
    patch.visibility = nextVisibility
    if (nextVisibility !== current.visibility) {
      const now = new Date()
      if (nextVisibility === 'published') {
        patch.publishedAt = now
        patch.hiddenAt = null
      } else {
        patch.hiddenAt = now
      }
    }
  }
  if (input.isNew !== undefined) patch.isNew = input.isNew
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? new Date() : null
  }

  await db.update(books).set(patch).where(eq(books.id, id))
  return fetchBookById(id)
}

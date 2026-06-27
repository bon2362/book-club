import { db } from '@/lib/db'
import { bookSummaries, books, signupBooks } from '@/lib/db/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import crypto from 'node:crypto'

export const ALLOWED_VISIBILITIES = ['hidden', 'published'] as const
export const ALLOWED_READING_STATUSES = ['reading', 'read'] as const
export const ALLOWED_TYPES = ['book', 'article'] as const

export type Visibility = (typeof ALLOWED_VISIBILITIES)[number]
export type ReadingStatus = (typeof ALLOWED_READING_STATUSES)[number]
export type BookType = (typeof ALLOWED_TYPES)[number]

export interface BookWithCover {
  id: string
  slug?: string | null
  name: string
  tags: string[]
  author: string
  type: string
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
  summaryCount: number
  submittedByMember?: boolean
  visibility?: 'hidden' | 'published'
  source?: 'admin' | 'submission'
  sortOrder?: number
}

// Test fixtures used to live in this file and were auto-seeded on every read
// in NEXTAUTH_TEST_MODE, but that wrote into the production database whenever
// CI ran. Fixture lifecycle now belongs to the E2E suite — each test creates
// its own book via the `createTestBook` fixture (see e2e/fixtures.ts), and the
// fixture removes it in teardown.

function rowToBook(row: typeof books.$inferSelect, signupCount = 0, summaryCount = 0): BookWithCover {
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    tags: Array.isArray(row.tags) ? row.tags : [],
    author: row.author,
    type: row.type === 'article' ? 'Article' : 'Book',
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
    source: row.source as 'admin' | 'submission',
    submittedByMember: row.source === 'submission',
    sortOrder: row.sortOrder,
    signupCount,
    summaryCount,
  }
}

interface ListOptions {
  includeHidden?: boolean
}

async function loadBooks(options: ListOptions = {}): Promise<BookWithCover[]> {
  const { includeHidden = false } = options
  const conditions = []
  if (!includeHidden) conditions.push(eq(books.visibility, 'published'))
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
  // The summaries table is introduced by a manual DB migration. Keep the
  // public catalog available while production deployment and migration are
  // briefly out of sync; summary-specific surfaces still require the table.
  const summaryCountsByBookId = await db
    .select({ bookId: bookSummaries.bookId, count: sql<number>`count(*)::int` })
    .from(bookSummaries)
    .where(eq(bookSummaries.status, 'published'))
    .groupBy(bookSummaries.bookId)
    .catch(() => [])

  const summaryCountById = new Map(summaryCountsByBookId.map(c => [c.bookId, Number(c.count)]))

  // Defence-in-depth: even if an e2e-test-created book somehow leaks into the
  // production DB (e.g. someone runs e2e against the wrong DATABASE_URL),
  // never show it on the live site. Hides:
  //   - legacy global seed books `__test_book_*` (no longer created, kept as guard)
  //   - per-test books `__e2e_book_*` (createTestBook fixture)
  //   - any title that starts with "E2E " (free-form fixture content)
  //
  // NOTE: the CI E2E job runs a *production* server (`next start`,
  // NODE_ENV=production) for speed/stability, and its fixtures legitimately
  // create "E2E "-prefixed books that the tests then assert on. We must NOT
  // hide those during that run, or the e2e suite fails against its own data.
  // `E2E_ALLOW_PRODUCTION_SERVER` is the canonical "this production runtime is
  // a CI e2e run, not the live site" flag (same signal lib/test-mode.ts gates
  // on, injected only by playwright.config.ts). On real Vercel prod it is never
  // set, so the live site keeps the full filter.
  const isE2EProdServer = process.env.E2E_ALLOW_PRODUCTION_SERVER === 'true'
  const safeRows = process.env.NODE_ENV === 'production' && !isE2EProdServer
    ? rows.filter(row =>
        !row.id.startsWith('__test_book_') &&
        !row.id.startsWith('__e2e_book_') &&
        !row.title.startsWith('E2E ')
      )
    : rows

  return safeRows.map(row => rowToBook(row, countById.get(row.id) ?? 0, summaryCountById.get(row.id) ?? 0))
}

export async function fetchBooksWithCovers(): Promise<BookWithCover[]> {
  return loadBooks({ includeHidden: false })
}

export async function fetchBooksForAdmin(): Promise<BookWithCover[]> {
  return loadBooks({ includeHidden: true })
}

export async function fetchBookById(id: string, dbClient: typeof db = db): Promise<BookWithCover | null> {
  const [row] = await dbClient.select().from(books).where(eq(books.id, id)).limit(1)
  return row ? rowToBook(row) : null
}

export async function fetchBookBySlug(slug: string, dbClient: typeof db = db): Promise<BookWithCover | null> {
  const [row] = await dbClient.select().from(books).where(eq(books.slug, slug)).limit(1)
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

const BOOK_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeBookSlug(value: unknown): string {
  if (typeof value !== 'string') throw new BookValidationError('book slug is required')
  const slug = value.trim().toLowerCase()
  if (!slug) throw new BookValidationError('book slug is required')
  if (slug.length > 100 || !BOOK_SLUG_PATTERN.test(slug)) {
    throw new BookValidationError('book slug must contain lowercase Latin letters, digits, and single hyphens')
  }
  return slug
}

export interface CreateBookInput {
  title: string
  author?: string
  tags?: unknown
  type?: unknown
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

export async function createBook(input: CreateBookInput, dbClient: typeof db = db): Promise<BookWithCover> {
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
  await dbClient.insert(books).values({
    id,
    title,
    author,
    tags: normalizeTags(input.tags),
    type,
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

  const created = await fetchBookById(id, dbClient)
  if (!created) throw new Error('Failed to load created book')
  return created
}

export interface UpdateBookInput {
  title?: string
  author?: string
  tags?: unknown
  type?: unknown
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

export async function updateBook(id: string, input: UpdateBookInput, dbClient: typeof db = db): Promise<BookWithCover | null> {
  const [current] = await dbClient.select().from(books).where(eq(books.id, id)).limit(1)
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

  await dbClient.update(books).set(patch).where(eq(books.id, id))
  return fetchBookById(id)
}

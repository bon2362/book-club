import { db } from '@/lib/db'
import { books, bookPriorities, signupBooks, users } from '@/lib/db/schema'
import { asc, eq, and, inArray } from 'drizzle-orm'
import { nextRank, compactRanks } from '@/lib/matching/rank-assignment'

export type PersonalBookStatus = 'reading' | 'read' | null

export interface UserSignupBook {
  bookId: string
  personalStatus: PersonalBookStatus
  statusUpdatedAt: string | null
  signedAt: string
}

export interface UserSignup {
  timestamp: string
  userId: string
  name: string
  email: string | null
  contactEmail?: string | null
  contacts: string
  selectedBooks: string[]       // titles joined from books.title (for legacy UI)
  selectedBookIds: string[]
  signups: UserSignupBook[]     // per-book personal_status + timestamps
  prioritiesSet?: boolean
}

export interface UpsertResult {
  isNew: boolean
  addedBooks: string[]    // titles — full resulting selection
  addedBookIds: string[]  // full resulting selection (NOT a delta)
  newlyAddedBookIds: string[] // delta: books added in this call
  removedBookIds: string[]    // delta: books removed in this call
}

interface SignupBookInput {
  id: string
  title: string
}

type SignupWriteDb = Pick<typeof db, 'delete' | 'insert'>

export async function getAllSignups(): Promise<UserSignup[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.contactEmail,
      contactEmail: users.contactEmail,
      contacts: users.contacts,
      prioritiesSet: users.prioritiesSet,
      bookId: signupBooks.bookId,
      bookTitle: books.title,
      signedAt: signupBooks.signedAt,
      personalStatus: signupBooks.personalStatus,
      personalStatusUpdatedAt: signupBooks.personalStatusUpdatedAt,
    })
    .from(signupBooks)
    .innerJoin(users, eq(signupBooks.userId, users.id))
    .innerJoin(books, eq(signupBooks.bookId, books.id))
    .orderBy(asc(users.name), asc(signupBooks.signedAt), asc(books.title))

  const byUser = new Map<string, UserSignup>()
  for (const row of rows) {
    const signupBook: UserSignupBook = {
      bookId: row.bookId,
      personalStatus: (row.personalStatus as PersonalBookStatus) ?? null,
      statusUpdatedAt: row.personalStatusUpdatedAt ? row.personalStatusUpdatedAt.toISOString() : null,
      signedAt: row.signedAt.toISOString(),
    }
    const existing = byUser.get(row.userId)
    if (existing) {
      existing.selectedBooks.push(row.bookTitle)
      existing.selectedBookIds.push(row.bookId)
      existing.signups.push(signupBook)
      continue
    }

    byUser.set(row.userId, {
      timestamp: row.signedAt.toISOString(),
      userId: row.userId,
      name: row.name ?? '',
      email: row.email,
      contactEmail: row.contactEmail,
      contacts: row.contacts ?? '',
      selectedBooks: [row.bookTitle],
      selectedBookIds: [row.bookId],
      signups: [signupBook],
      prioritiesSet: row.prioritiesSet,
    })
  }

  return Array.from(byUser.values())
}

function normalizeIds(bookIds: string[]): string[] {
  return Array.from(new Set(bookIds.map(b => b.trim()).filter(Boolean)))
}

async function resolveBooksByIds(bookIds: string[]): Promise<SignupBookInput[]> {
  const normalized = normalizeIds(bookIds)
  if (normalized.length === 0) return []
  const rows = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(inArray(books.id, normalized))
  const byId = new Map(rows.map(row => [row.id, row.title]))
  const resolved = normalized.flatMap(id => {
    const title = byId.get(id)
    return title ? [{ id, title }] : []
  })
  if (resolved.length !== normalized.length) {
    throw new Error('BOOK_ID_NOT_FOUND')
  }
  return resolved
}

async function upsertResolvedSignup(
  userId: string,
  selectedBooks: SignupBookInput[],
  dbClient: typeof db = db,
): Promise<UpsertResult> {
  const unique = new Map<string, SignupBookInput>()
  for (const book of selectedBooks) unique.set(book.id, book)
  const normalized = Array.from(unique.values())
  const newBookIds = normalized.map(b => b.id)

  let newlyAddedBookIds: string[] = []
  let removedBookIds: string[] = []

  const runInTx = async (tx: typeof db) => {
    const existing = await tx
      .select({ bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(eq(signupBooks.userId, userId))

    const existingIds = new Set(existing.map(e => e.bookId))
    const toDelete = Array.from(existingIds).filter(id => !newBookIds.includes(id))
    const toAdd = newBookIds.filter(id => !existingIds.has(id))
    newlyAddedBookIds = toAdd
    removedBookIds = toDelete

    if (toDelete.length > 0) {
      await tx
        .delete(signupBooks)
        .where(and(eq(signupBooks.userId, userId), inArray(signupBooks.bookId, toDelete)))
      // Инвариант: удалённая запись не оставляет висящий ранг.
      await tx
        .delete(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), inArray(bookPriorities.bookId, toDelete)))
    }

    if (toAdd.length > 0) {
      await tx
        .insert(signupBooks)
        .values(toAdd.map(bookId => ({ userId, bookId })))
        .onConflictDoNothing()
    }

    // Дописать auto-ранги новым книгам в конец списка приоритетов.
    const ranked = await tx
      .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(eq(bookPriorities.userId, userId))
    let rankCursor = nextRank(ranked)
    const missingRank = toAdd.filter(id => !ranked.some(r => r.bookId === id))
    for (const bookId of missingRank) {
      await tx
        .insert(bookPriorities)
        .values({ userId, bookId, rank: rankCursor, rankSource: 'auto' })
        .onConflictDoNothing()
      rankCursor += 1
    }

    // Компактизация после удалений, чтобы ранги оставались 1..N.
    if (toDelete.length > 0) {
      const remaining = await tx
        .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
      for (const row of compactRanks(remaining)) {
        await tx
          .update(bookPriorities)
          .set({ rank: row.rank, updatedAt: new Date() })
          .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, row.bookId)))
      }
    }
  }

  // When a transactional dbClient is supplied (e.g. from withAuditContext on
  // the caller), run inside it so the audit context is attached. Otherwise open
  // our own transaction to keep the delete/insert atomic.
  if (dbClient === db) {
    // Атомарность delete+insert, когда вызывают без транзакционного клиента
    // (сейчас — только exempt тест-эндпоинт; рабочие роуты передают tx из withAuditContext).
    // eslint-disable-next-line no-restricted-syntax -- см. комментарий выше
    await db.transaction(async (tx) => runInTx(tx as unknown as typeof db))
  } else {
    await runInTx(dbClient)
  }

  return {
    isNew: false,
    addedBooks: normalized.map(book => book.title),
    addedBookIds: normalized.map(book => book.id),
    newlyAddedBookIds,
    removedBookIds,
  }
}

export async function previewSignupByBookIds(
  userId: string,
  bookIds: string[],
): Promise<UpsertResult> {
  const selectedBooks = await resolveBooksByIds(bookIds)
  const selectedBookIds = selectedBooks.map((book) => book.id)
  const existing = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(eq(signupBooks.userId, userId))
  const existingIds = new Set(existing.map((row) => row.bookId))
  const selectedIds = new Set(selectedBookIds)

  return {
    isNew: false,
    addedBooks: selectedBooks.map((book) => book.title),
    addedBookIds: selectedBookIds,
    newlyAddedBookIds: selectedBookIds.filter((bookId) => !existingIds.has(bookId)),
    removedBookIds: Array.from(existingIds).filter((bookId) => !selectedIds.has(bookId)),
  }
}

export async function upsertSignupByBookIds(
  userId: string,
  bookIds: string[],
  dbClient: typeof db = db,
): Promise<UpsertResult> {
  return upsertResolvedSignup(userId, await resolveBooksByIds(bookIds), dbClient)
}

export async function removeBookFromSignup(
  userId: string,
  bookId: string,
  client: SignupWriteDb = db
): Promise<void> {
  await client
    .delete(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
}

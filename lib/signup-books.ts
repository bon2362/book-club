import { db, sql } from '@/lib/db'
import { books, signupBooks, users } from '@/lib/db/schema'
import { asc, eq, and, inArray } from 'drizzle-orm'

export interface UserSignup {
  timestamp: string
  userId: string
  name: string
  email: string | null
  contactEmail?: string | null
  contacts: string
  selectedBooks: string[]
  selectedBookIds?: string[]
  prioritiesSet?: boolean
}

export interface UpsertResult {
  isNew: boolean
  addedBooks: string[]
  addedBookIds: string[]
}

interface SignupBookInput {
  id: string
  title: string
}

export async function getAllSignups(): Promise<UserSignup[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.contactEmail,
      contactEmail: users.contactEmail,
      contacts: users.contacts,
      prioritiesSet: users.prioritiesSet,
      bookName: signupBooks.bookName,
      bookId: signupBooks.bookId,
      signedAt: signupBooks.signedAt,
    })
    .from(signupBooks)
    .innerJoin(users, eq(signupBooks.userId, users.id))
    .orderBy(asc(users.name), asc(signupBooks.signedAt), asc(signupBooks.bookName))

  const byUser = new Map<string, UserSignup>()
  for (const row of rows) {
    const existing = byUser.get(row.userId)
    if (existing) {
      existing.selectedBooks.push(row.bookName)
      if (row.bookId) (existing.selectedBookIds ??= []).push(row.bookId)
      continue
    }

    byUser.set(row.userId, {
      timestamp: row.signedAt.toISOString(),
      userId: row.userId,
      name: row.name ?? '',
      email: row.email,
      contactEmail: row.contactEmail,
      contacts: row.contacts ?? '',
      selectedBooks: [row.bookName],
      selectedBookIds: row.bookId ? [row.bookId] : [],
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

async function resolveBooksByNames(bookNames: string[]): Promise<SignupBookInput[]> {
  const normalized = normalizeIds(bookNames)
  if (normalized.length === 0) return []

  const rows = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(inArray(books.title, normalized))
  const countByTitle = new Map<string, number>()
  for (const r of rows) countByTitle.set(r.title, (countByTitle.get(r.title) ?? 0) + 1)
  const uniqueByTitle = new Map<string, string>()
  for (const r of rows) {
    if ((countByTitle.get(r.title) ?? 0) === 1) uniqueByTitle.set(r.title, r.id)
  }
  return normalized.flatMap(title => {
    const id = uniqueByTitle.get(title)
    return id ? [{ id, title }] : []
  })
}

async function upsertResolvedSignup(userId: string, selectedBooks: SignupBookInput[]): Promise<UpsertResult> {
  const unique = new Map<string, SignupBookInput>()
  for (const book of selectedBooks) unique.set(book.id, book)
  const normalized = Array.from(unique.values())

  await sql.transaction(tx => [
    tx`DELETE FROM signup_books WHERE user_id = ${userId}`,
    ...normalized.map(book =>
      tx`INSERT INTO signup_books (user_id, book_name, book_id) VALUES (${userId}, ${book.title}, ${book.id}) ON CONFLICT DO NOTHING`
    ),
  ])

  return { isNew: false, addedBooks: normalized.map(book => book.title), addedBookIds: normalized.map(book => book.id) }
}

export async function upsertSignupByBookIds(userId: string, bookIds: string[]): Promise<UpsertResult> {
  return upsertResolvedSignup(userId, await resolveBooksByIds(bookIds))
}

export async function upsertSignup(userId: string, bookNames: string[]): Promise<UpsertResult> {
  const normalized = normalizeIds(bookNames)
  const resolved = await resolveBooksByNames(normalized)
  if (resolved.length !== normalized.length) {
    throw new Error('BOOK_NAME_NOT_FOUND')
  }
  return upsertResolvedSignup(userId, resolved)
}

export async function removeBookFromSignup(userId: string, bookId: string): Promise<void> {
  await db
    .delete(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
}

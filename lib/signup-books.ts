import { db, sql } from '@/lib/db'
import { signupBooks, users } from '@/lib/db/schema'
import { asc, eq, and } from 'drizzle-orm'

export interface UserSignup {
  timestamp: string
  userId: string
  name: string
  email: string
  contacts: string
  selectedBooks: string[]
  prioritiesSet?: boolean
}

export interface UpsertResult {
  isNew: boolean
  addedBooks: string[]
}

export async function getAllSignups(): Promise<UserSignup[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      contacts: users.contacts,
      prioritiesSet: users.prioritiesSet,
      bookName: signupBooks.bookName,
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
      continue
    }

    byUser.set(row.userId, {
      timestamp: row.signedAt.toISOString(),
      userId: row.userId,
      name: row.name ?? '',
      email: row.email,
      contacts: row.contacts ?? '',
      selectedBooks: [row.bookName],
      prioritiesSet: row.prioritiesSet,
    })
  }

  return Array.from(byUser.values())
}

export async function upsertSignup(userId: string, bookNames: string[]): Promise<UpsertResult> {
  const normalized = Array.from(new Set(bookNames.map(b => b.trim()).filter(Boolean)))

  await sql.transaction(tx => [
    tx`DELETE FROM signup_books WHERE user_id = ${userId}`,
    ...normalized.map(bookName =>
      tx`INSERT INTO signup_books (user_id, book_name) VALUES (${userId}, ${bookName}) ON CONFLICT DO NOTHING`
    ),
  ])

  return { isNew: false, addedBooks: normalized }
}

export async function removeBookFromSignup(userId: string, bookName: string): Promise<void> {
  await db
    .delete(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookName, bookName)))
}

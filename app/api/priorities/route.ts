export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, books as booksTable, users } from '@/lib/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'

export async function GET() {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const rows = await db
    .select({ bookId: bookPriorities.bookId, bookName: bookPriorities.bookName, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const body = await req.json()
  const { bookIds, books } = body as { bookIds?: unknown; books?: unknown }
  const rawSelection = Array.isArray(bookIds) ? bookIds : books

  if (
    !Array.isArray(rawSelection) ||
    rawSelection.length === 0 ||
    rawSelection.some(b => typeof b !== 'string' || !b.trim())
  ) {
    return NextResponse.json({ error: 'bookIds must be a non-empty array of strings' }, { status: 400 })
  }

  const requested = Array.from(new Set((rawSelection as string[]).map(b => b.trim()).filter(Boolean)))
  const bookRows = Array.isArray(bookIds)
    ? await db
      .select({ id: booksTable.id, title: booksTable.title })
      .from(booksTable)
      .where(inArray(booksTable.id, requested))
    : await db
      .select({ id: booksTable.id, title: booksTable.title })
      .from(booksTable)
      .where(inArray(booksTable.title, requested))
  const rowsById = new Map(bookRows.map(row => [row.id, row]))
  const rowsByTitle = new Map(bookRows.map(row => [row.title, row]))
  const validBooks = requested.flatMap(value => {
    const row = Array.isArray(bookIds) ? rowsById.get(value) : rowsByTitle.get(value)
    return row ? [{ bookId: row.id, bookName: row.title }] : []
  })
  if (validBooks.length !== requested.length) {
    return NextResponse.json({ error: 'Some books were not found' }, { status: 400 })
  }
  const now = new Date()

  await db
    .delete(bookPriorities)
    .where(eq(bookPriorities.userId, userId))

  await db
    .insert(bookPriorities)
    .values(
      validBooks.map((book, index) => ({
        userId,
        bookName: book.bookName,
        bookId: book.bookId,
        rank: index + 1,
        updatedAt: now,
      }))
    )

  await db
    .update(users)
    .set({ prioritiesSet: true })
    .where(eq(users.id, userId))

  await bestEffortRecordUserActivity(userId, 'priorities_updated', {
    occurredAt: now,
    source: 'api',
    sourceId: userId,
    dedupeKey: buildUserActivityDedupeKey(['api', 'priorities_updated', userId, JSON.stringify(validBooks.map(book => book.bookId))]),
    metadata: { booksCount: validBooks.length },
  })

  revalidatePath('/admin')

  return NextResponse.json({ ok: true })
}

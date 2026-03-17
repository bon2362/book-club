export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeBookFromSignup } from '@/lib/signups'
import { db } from '@/lib/db'
import { bookPriorities, users } from '@/lib/db/schema'
import { eq, and, gt, sql } from 'drizzle-orm'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, bookName } = await req.json() as { userId: string; bookName: string }
  if (!userId || !bookName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await removeBookFromSignup(userId, bookName)

  // userId in signups = user's email; look up pgId
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userId))
  const pgUser = userRows[0]
  if (!pgUser) return NextResponse.json({ ok: true })

  // Find this book's current rank
  const existing = await db
    .select({ rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(and(eq(bookPriorities.userId, pgUser.id), eq(bookPriorities.bookName, bookName)))
  const priorityRow = existing[0]
  if (!priorityRow) return NextResponse.json({ ok: true })

  const deletedRank = priorityRow.rank

  // Delete the priority entry
  await db
    .delete(bookPriorities)
    .where(and(eq(bookPriorities.userId, pgUser.id), eq(bookPriorities.bookName, bookName)))

  // Re-rank: close the gap (rank > deletedRank → rank - 1)
  await db
    .update(bookPriorities)
    .set({ rank: sql`${bookPriorities.rank} - 1` })
    .where(and(eq(bookPriorities.userId, pgUser.id), gt(bookPriorities.rank, deletedRank)))

  return NextResponse.json({ ok: true })
}

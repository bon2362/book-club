export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities } from '@/lib/db/schema'
import { removeBookFromSignup } from '@/lib/signup-books'
import { and, eq, gt, sql } from 'drizzle-orm'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, bookName } = await req.json() as { userId?: string; bookName?: string }
  if (!userId || !bookName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const [existing] = await db
    .select({ rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookName, bookName)))
    .limit(1)

  await removeBookFromSignup(userId, bookName)

  if (existing) {
    await db
      .delete(bookPriorities)
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookName, bookName)))

    await db
      .update(bookPriorities)
      .set({ rank: sql`${bookPriorities.rank} - 1` })
      .where(and(eq(bookPriorities.userId, userId), gt(bookPriorities.rank, existing.rank)))
  }

  return NextResponse.json({ ok: true })
}

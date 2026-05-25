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

  const { userId, bookId } = await req.json() as { userId?: string; bookId?: string }
  if (!userId || !bookId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
      .limit(1)

    await removeBookFromSignup(userId, bookId, tx)

    if (existing) {
      await tx
        .delete(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))

      await tx
        .update(bookPriorities)
        .set({ rank: sql`${bookPriorities.rank} - 1` })
        .where(and(eq(bookPriorities.userId, userId), gt(bookPriorities.rank, existing.rank)))
    }
  })

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, signupBooks } from '@/lib/db/schema'
import { removeBookFromSignup } from '@/lib/signup-books'
import { and, eq, gt, sql } from 'drizzle-orm'

const VALID_STATUSES = new Set(['reading', 'read'])

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { userId, bookId, status } = (body ?? {}) as {
    userId?: string
    bookId?: string
    status?: string | null
  }

  if (!userId || !bookId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (status !== null && status !== undefined && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Verify the user is signed up for this book
  const [signup] = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)

  if (!signup) {
    return NextResponse.json({ error: 'Not signed up for this book' }, { status: 404 })
  }

  await db.transaction(async (tx) => {
    // 1. Update personal_status
    await tx
      .update(signupBooks)
      .set({ personalStatus: status ?? null, personalStatusUpdatedAt: new Date() })
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))

    // 2. If moving to reading/read: remove from book_priorities and rerank
    if (status !== null && status !== undefined) {
      const [existing] = await tx
        .select({ rank: bookPriorities.rank })
        .from(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
        .limit(1)

      if (existing) {
        await tx
          .delete(bookPriorities)
          .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))

        await tx
          .update(bookPriorities)
          .set({ rank: sql`${bookPriorities.rank} - 1` })
          .where(and(eq(bookPriorities.userId, userId), gt(bookPriorities.rank, existing.rank)))
      }
    }
    // If status === null: leave book_priorities untouched
  })

  return NextResponse.json({ ok: true })
}

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

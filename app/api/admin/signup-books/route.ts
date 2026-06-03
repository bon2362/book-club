export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, signupBooks } from '@/lib/db/schema'
import { removeBookFromSignup } from '@/lib/signup-books'
import { and, eq, gt, sql } from 'drizzle-orm'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'

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

  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  const before = activeSessionId ? await captureMatchingMutationSnapshot(activeSessionId) : null

  let signupExists = false
  await db.transaction(async (tx) => {
    // 1. Verify the user is signed up for this book (inside transaction to avoid race condition)
    const [signup] = await tx
      .select({ bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
      .limit(1)

    if (!signup) return

    signupExists = true

    // 2. Update personal_status
    await tx
      .update(signupBooks)
      .set({ personalStatus: status ?? null, personalStatusUpdatedAt: new Date() })
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))

    // 3. If moving to reading/read: remove from book_priorities and rerank
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

  if (!signupExists) {
    return NextResponse.json({ error: 'Not signed up for this book' }, { status: 404 })
  }

  if (activeSessionId) {
    await finalizeMatchingMutationEffects({
      sessionId: activeSessionId,
      targetUserId: userId,
      actorUserId: session.user.id!,
      bookId,
      kind: 'status_changed',
      source: 'admin',
      before,
      metadata: { status: status ?? null },
    })
  }
  await broadcastActiveMatchingStateChangeForParticipant(userId, {
    kind: 'admin_personal_status_updated',
    bookId,
    status: status ?? null,
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

  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  const before = activeSessionId ? await captureMatchingMutationSnapshot(activeSessionId) : null

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

  if (activeSessionId) {
    await finalizeMatchingMutationEffects({
      sessionId: activeSessionId,
      targetUserId: userId,
      actorUserId: session.user.id!,
      bookId,
      kind: 'book_removed',
      source: 'admin',
      before,
    })
  }
  await broadcastActiveMatchingStateChangeForParticipant(userId, {
    kind: 'admin_book_removed',
    bookId,
  })

  return NextResponse.json({ ok: true })
}

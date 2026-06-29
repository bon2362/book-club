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
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

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

  const [signup] = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)
  if (!signup) {
    return NextResponse.json({ error: 'Not signed up for this book' }, { status: 404 })
  }

  if (activeSessionId) {
    try {
      await runMatchingTransition({
        sessionId: activeSessionId,
        actor: {
          userId: session.user.id ?? null,
          label: session.user.name ?? session.user.contactEmail ?? null,
          source: 'admin',
        },
        action: {
          type: 'change_status',
          userId,
          bookId,
          status: (status ?? null) as 'reading' | 'read' | null,
        },
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      return transitionError(error)
    }
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => {
    await tx
      .update(signupBooks)
      .set({ personalStatus: status ?? null, personalStatusUpdatedAt: new Date() })
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))

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
    },
  )
  await broadcastActiveMatchingStateChangeForParticipant(userId)

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

  if (activeSessionId) {
    try {
      await runMatchingTransition({
        sessionId: activeSessionId,
        actor: {
          userId: session.user.id ?? null,
          label: session.user.name ?? session.user.contactEmail ?? null,
          source: 'admin',
        },
        action: { type: 'change_book', userId, bookId, operation: 'remove' },
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      return transitionError(error)
    }
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => {
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
    },
  )

  await broadcastActiveMatchingStateChangeForParticipant(userId)

  return NextResponse.json({ ok: true })
}

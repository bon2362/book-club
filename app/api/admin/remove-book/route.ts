export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeBookFromSignup } from '@/lib/signup-books'
import { bookPriorities } from '@/lib/db/schema'
import { eq, and, gt, sql } from 'drizzle-orm'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, bookId } = await req.json() as { userId: string; bookId: string }
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
    await removeBookFromSignup(userId, bookId, tx)

    const [priorityRow] = await tx
      .select({ rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
      .limit(1)
    if (!priorityRow) return

    await tx
      .delete(bookPriorities)
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))

    await tx
      .update(bookPriorities)
      .set({ rank: sql`${bookPriorities.rank} - 1` })
      .where(and(eq(bookPriorities.userId, userId), gt(bookPriorities.rank, priorityRow.rank)))
    },
  )

  await broadcastActiveMatchingStateChangeForParticipant(userId)

  return NextResponse.json({ ok: true })
}

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
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'
import { withAuditContext } from '@/lib/audit/with-audit-context'

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
  const before = activeSessionId ? await captureMatchingMutationSnapshot(activeSessionId) : null

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
  await broadcastActiveMatchingStateChangeForParticipant(userId)

  return NextResponse.json({ ok: true })
}

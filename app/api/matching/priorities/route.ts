export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, bookPriorities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asUserId = new URL(req.url).searchParams.get('as')
  if (asUserId && !session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [activeSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (!activeSession) return NextResponse.json({ error: 'No active session' }, { status: 404 })
  if (activeSession.status === 'frozen') return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const bookIds: unknown = body.bookIds
  if (!Array.isArray(bookIds) || bookIds.length === 0 || bookIds.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'bookIds must be a non-empty string array' }, { status: 400 })
  }

  const userId = asUserId ?? session.user.id
  const ordered = bookIds as string[]

  // Snapshot the leader scenario before the change so analytics can show impact.
  const before = await captureMatchingMutationSnapshot(activeSession.id)

  // Upsert each book with its new rank (1-indexed position)
  for (let i = 0; i < ordered.length; i++) {
    await db
      .insert(bookPriorities)
      .values({ userId, bookId: ordered[i], rank: i + 1 })
      .onConflictDoUpdate({
        target: [bookPriorities.userId, bookPriorities.bookId],
        set: { rank: i + 1, updatedAt: new Date() },
      })
  }

  // Return canonical order so client can reconcile
  const canonical = await db
    .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))

  broadcast(activeSession.id, 'state_changed', { kind: 'ranks_updated' })

  // Persist analytics: reordering priorities from the /matching page.
  await finalizeMatchingMutationEffects({
    sessionId: activeSession.id,
    targetUserId: userId,
    actorUserId: session.user.id,
    bookId: null,
    kind: 'priorities_updated',
    source: 'matching',
    before,
    metadata: { rankedBookIds: ordered },
  })

  return NextResponse.json({ ranks: canonical }, { status: 200 })
}

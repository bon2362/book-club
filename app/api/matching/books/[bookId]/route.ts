export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, signupBooks, bookPriorities } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'

type Params = { params: { bookId: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
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

  const userId = asUserId ?? session.user.id
  const { bookId } = params
  const before = await captureMatchingMutationSnapshot(activeSession.id)

  await db.delete(signupBooks).where(
    and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId))
  )
  await db.delete(bookPriorities).where(
    and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId))
  )

  // Normalize ranks for remaining books
  const remaining = await db
    .select({ bookId: bookPriorities.bookId })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))

  for (let i = 0; i < remaining.length; i++) {
    await db
      .update(bookPriorities)
      .set({ rank: i + 1 })
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, remaining[i].bookId)))
  }

  await finalizeMatchingMutationEffects({
    sessionId: activeSession.id,
    targetUserId: userId,
    actorUserId: session.user.id,
    bookId,
    kind: 'book_removed',
    source: asUserId ? 'admin' : 'matching',
    before,
  })
  broadcast(activeSession.id, 'state_changed', { kind: 'book_removed', bookId })

  return NextResponse.json({ ok: true }, { status: 200 })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, bookPriorities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const userId = session.user.id
  const ordered = bookIds as string[]

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

  broadcast(activeSession.id, 'state_changed', { userId, kind: 'ranks_updated' })

  return NextResponse.json({ ranks: canonical }, { status: 200 })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, signupBooks, bookPriorities } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'

export async function POST(req: NextRequest) {
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
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })

  await db
    .insert(signupBooks)
    .values({ userId: session.user.id, bookId })
    .onConflictDoNothing()

  const userId = session.user.id
  const currentOrder = await db
    .select({ bookId: bookPriorities.bookId })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))

  const nextOrder = [
    bookId,
    ...currentOrder
      .map((row) => row.bookId)
      .filter((existingBookId) => existingBookId !== bookId),
  ]

  for (let i = 0; i < nextOrder.length; i++) {
    await db
      .insert(bookPriorities)
      .values({ userId, bookId: nextOrder[i], rank: i + 1 })
      .onConflictDoUpdate({
        target: [bookPriorities.userId, bookPriorities.bookId],
        set: { rank: i + 1, updatedAt: new Date() },
      })
  }

  broadcast(activeSession.id, 'state_changed', { userId, kind: 'book_added', bookId })

  return NextResponse.json({ ok: true }, { status: 200 })
}

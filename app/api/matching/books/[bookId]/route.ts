export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, signupBooks, bookPriorities } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'

type Params = { params: { bookId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [activeSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (!activeSession) return NextResponse.json({ error: 'No active session' }, { status: 404 })
  if (activeSession.status === 'frozen') return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })

  const userId = session.user.id
  const { bookId } = params

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

  return NextResponse.json({ ok: true }, { status: 200 })
}

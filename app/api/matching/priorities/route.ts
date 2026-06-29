export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, bookPriorities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asUserId = new URL(req.url).searchParams.get('as')
  if (asUserId && !session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const userId = asUserId ?? session.user.id

  const [activeSession] = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)
  if (!activeSession) return NextResponse.json({ error: 'No active session' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const bookIds: unknown = body.bookIds
  if (!Array.isArray(bookIds) || bookIds.length === 0 || bookIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'bookIds must be a non-empty string array' }, { status: 400 })
  }
  const ordered = bookIds as string[]

  try {
    await runMatchingTransition({
      sessionId: activeSession.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: asUserId ? 'admin' : 'matching',
      },
      action: { type: 'reorder_priorities', userId, bookIds: ordered },
    })
  } catch (error) {
    return transitionError(error)
  }

  const canonical = await db
    .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))

  return NextResponse.json({ ranks: canonical }, { status: 200 })
}

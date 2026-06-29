export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

export async function POST(req: NextRequest) {
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
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })

  try {
    const result = await runMatchingTransition({
      sessionId: activeSession.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: asUserId ? 'admin' : 'matching',
      },
      action: { type: 'change_book', userId, bookId, operation: 'add' },
    })
    return NextResponse.json(result)
  } catch (error) {
    return transitionError(error)
  }
}

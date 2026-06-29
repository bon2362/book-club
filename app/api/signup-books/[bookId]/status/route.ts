export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

const VALID_STATUSES = new Set(['reading', 'read'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { bookId: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const asUserId = new URL(req.url).searchParams.get('as')
  if (asUserId && !session.user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { status } = body ?? {}

  if (status !== null && status !== undefined && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status. Expected "reading", "read", or null.' }, { status: 400 })
  }

  const { bookId } = params
  const userId = asUserId ?? session.user.id
  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)

  // Verify user is signed up for this book
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
          userId: session.user.id,
          label: session.user.name ?? session.user.contactEmail ?? null,
          source: asUserId ? 'admin' : 'catalog',
        },
        action: { type: 'change_status', userId, bookId, status: status ?? null },
      })
    } catch (error) {
      return transitionError(error)
    }
  } else {
    await withAuditContext(
      { actorUserId: session.user.id, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: asUserId ? 'admin' : 'catalog' },
      async (tx) => {
        await tx.update(signupBooks)
          .set({ personalStatus: status ?? null, personalStatusUpdatedAt: new Date() })
          .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
      },
    )
    await broadcastActiveMatchingStateChangeForParticipant(userId)
  }

  return NextResponse.json({ ok: true })
}

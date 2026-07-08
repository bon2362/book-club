export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks, bookPriorities } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'
import { nextRank, compactRanks } from '@/lib/matching/rank-assignment'

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

        // Keep book_priorities in sync with the mandatory-rank invariant:
        // every signup_books row with personal_status=null has exactly one
        // book_priorities row. Mirrors MatchingTransitionExecutor.changeStatus
        // (lib/matching/session-transition-db.ts) for the no-active-session path.
        //
        // `.for('update')` locks this user's book_priorities rows for the rest
        // of the transaction so a concurrent request touching the same rows
        // (e.g. an overlapping PUT /api/priorities, or a duplicate PATCH) waits
        // instead of racing the read-then-write below — read-then-write without
        // this lock produced both a Postgres deadlock (40P01, two per-row
        // UPDATE loops crossing lock order) and a duplicate-key insert race
        // under e2e-test concurrency.
        if (status !== null) {
          const existing = await tx
            .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank, rankSource: bookPriorities.rankSource })
            .from(bookPriorities)
            .where(eq(bookPriorities.userId, userId))
            .for('update')
          const remaining = existing.filter((row) => row.bookId !== bookId)
          await tx.delete(bookPriorities).where(eq(bookPriorities.userId, userId))
          if (remaining.length > 0) {
            const sourceByBookId = new Map(remaining.map((row) => [row.bookId, row.rankSource]))
            await tx.insert(bookPriorities).values(
              compactRanks(remaining).map(({ bookId: id, rank }) => ({
                userId,
                bookId: id,
                rank,
                rankSource: sourceByBookId.get(id) ?? 'auto',
                updatedAt: new Date(),
              })),
            )
          }
        } else {
          const ranked = await tx
            .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
            .from(bookPriorities)
            .where(eq(bookPriorities.userId, userId))
            .for('update')
          await tx.insert(bookPriorities)
            .values({ userId, bookId, rank: nextRank(ranked), rankSource: 'auto' })
            .onConflictDoNothing()
        }
      },
    )
    await broadcastActiveMatchingStateChangeForParticipant(userId)
  }

  return NextResponse.json({ ok: true })
}

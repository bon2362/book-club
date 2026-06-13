export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, bookPriorities, users } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { bumpSessionState } from '@/lib/matching/realtime/version'
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'
import { withAuditContext } from '@/lib/audit/with-audit-context'

const prioritySources = ['matching', 'matching_priority_gate'] as const
type PrioritySource = typeof prioritySources[number]

function parsePrioritySource(source: unknown): PrioritySource {
  return prioritySources.includes(source as PrioritySource) ? source as PrioritySource : 'matching'
}

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
  const source = parsePrioritySource(body.source)
  if (!Array.isArray(bookIds) || bookIds.length === 0 || bookIds.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'bookIds must be a non-empty string array' }, { status: 400 })
  }

  const userId = asUserId ?? session.user.id
  const ordered = bookIds as string[]
  const actorId = session.user.id
  const actorLabel = session.user.name ?? session.user.contactEmail ?? null
  const auditSource = asUserId ? 'admin' : source

  // Snapshot the leader scenario before the change so analytics can show impact.
  const before = await captureMatchingMutationSnapshot(activeSession.id)

  // Capture the participant's ranking before the change so the admin viewer can
  // show only the diff instead of the full priority list.
  const previousRanks = await db
    .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))
  const previousRankedBookIds = previousRanks.map(row => row.bookId)

  // Upsert each book with its new rank (1-indexed position)
  await withAuditContext(
    { actorUserId: actorId, actorLabel, source: auditSource },
    async (tx) => {
      for (let i = 0; i < ordered.length; i++) {
        await tx
          .insert(bookPriorities)
          .values({ userId, bookId: ordered[i], rank: i + 1 })
          .onConflictDoUpdate({
            target: [bookPriorities.userId, bookPriorities.bookId],
            set: { rank: i + 1, updatedAt: new Date() },
          })
      }

      await tx
        .update(users)
        .set({ prioritiesSet: true })
        .where(eq(users.id, userId))
    },
  )

  // Return canonical order so client can reconcile
  const canonical = await db
    .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))

  await bumpSessionState(activeSession.id)

  // Persist analytics: reordering priorities from the /matching page.
  await finalizeMatchingMutationEffects({
    sessionId: activeSession.id,
    targetUserId: userId,
    actorUserId: actorId,
    bookId: null,
    kind: 'priorities_updated',
    source: auditSource,
    before,
    metadata: { rankedBookIds: ordered, previousRankedBookIds },
  })

  return NextResponse.json({ ranks: canonical }, { status: 200 })
}

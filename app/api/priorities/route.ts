export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, books as booksTable, users } from '@/lib/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

export async function GET() {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const rows = await db
    .select({ bookId: bookPriorities.bookId, bookName: booksTable.title, rank: bookPriorities.rank })
    .from(bookPriorities)
    .innerJoin(booksTable, eq(bookPriorities.bookId, booksTable.id))
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const body = await req.json()
  const { bookIds } = body as { bookIds?: unknown }

  if (
    !Array.isArray(bookIds) ||
    bookIds.length === 0 ||
    bookIds.some(b => typeof b !== 'string' || !b.trim())
  ) {
    return NextResponse.json({ error: 'bookIds must be a non-empty array of strings' }, { status: 400 })
  }

  const requested = Array.from(new Set((bookIds as string[]).map(b => b.trim()).filter(Boolean)))
  const bookRows = await db
    .select({ id: booksTable.id })
    .from(booksTable)
    .where(inArray(booksTable.id, requested))
  const rowsById = new Set(bookRows.map(row => row.id))
  const validBookIds = requested.filter(id => rowsById.has(id))
  if (validBookIds.length !== requested.length) {
    return NextResponse.json({ error: 'Some books were not found' }, { status: 400 })
  }
  const now = new Date()
  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  if (activeSessionId) {
    try {
      await runMatchingTransition({
        sessionId: activeSessionId,
        actor: {
          userId,
          label: session!.user.name ?? session!.user.contactEmail ?? null,
          source: 'profile',
        },
        action: { type: 'reorder_priorities', userId, bookIds: validBookIds },
      })
    } catch (error) {
      return transitionError(error)
    }
  } else {
    await withAuditContext(
      { actorUserId: userId, actorLabel: session!.user.name ?? session!.user.contactEmail ?? null, source: 'priorities' },
      async (tx) => {
        await tx.delete(bookPriorities).where(eq(bookPriorities.userId, userId))
        await tx.insert(bookPriorities).values(validBookIds.map((bookId, index) => ({
          userId,
          bookId,
          rank: index + 1,
          updatedAt: now,
        })))
        await tx.update(users).set({ prioritiesSet: true }).where(eq(users.id, userId))
      },
    )
  }

  await bestEffortRecordUserActivity(userId, 'priorities_updated', {
    occurredAt: now,
    source: 'api',
    sourceId: userId,
    dedupeKey: buildUserActivityDedupeKey(['api', 'priorities_updated', userId, JSON.stringify(validBookIds)]),
    metadata: { booksCount: validBookIds.length },
  })

  revalidatePath('/admin')
  if (!activeSessionId) await broadcastActiveMatchingStateChangeForParticipant(userId)

  return NextResponse.json({ ok: true })
}

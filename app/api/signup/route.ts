import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignupByBookIds } from '@/lib/signup-books'
import { bookPriorities, notificationQueue, users } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'
import { getUserContactEmail } from '@/lib/user-email'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import {
  captureMatchingMutationSnapshot,
  finalizeMatchingMutationEffects,
} from '@/lib/matching/mutation-effects'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export async function POST(req: NextRequest) {
  const session = await auth()
  const pgUserId = session?.user?.id
  if (!pgUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBookIds } = body

  if (!name?.trim() || typeof contacts !== 'string' || !Array.isArray(selectedBookIds)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const activeSessionId = await getActiveMatchingSessionIdForParticipant(pgUserId)
  const before = activeSessionId ? await captureMatchingMutationSnapshot(activeSessionId) : null

  const auditCtx = {
    actorUserId: pgUserId,
    actorLabel: session!.user.name ?? session!.user.contactEmail ?? null,
    source: 'signup',
  }

  let result
  try {
    result = await withAuditContext(auditCtx, async (tx) => {
      const upsert = await upsertSignupByBookIds(pgUserId, selectedBookIds as string[], tx)

      await tx.update(users).set({
        name: name.trim(),
        contacts: contacts.trim(),
        ...(upsert.addedBookIds.length === 0 ? { prioritiesSet: false } : {}),
      }).where(eq(users.id, pgUserId))

      // Clean up book_priorities for books no longer in selectedBookIds.
      if (upsert.addedBookIds.length > 0) {
        await tx
          .delete(bookPriorities)
          .where(
            and(
              eq(bookPriorities.userId, pgUserId),
              notInArray(bookPriorities.bookId, upsert.addedBookIds)
            )
          )
      } else {
        await tx
          .delete(bookPriorities)
          .where(eq(bookPriorities.userId, pgUserId))
      }

      return upsert
    })
  } catch {
    return NextResponse.json({ error: 'Some books were not found' }, { status: 400 })
  }

  const profileDedupeKey = buildUserActivityDedupeKey([
    'api',
    'profile_submitted',
    pgUserId,
    name.trim(),
    contacts.trim(),
    JSON.stringify(result.addedBookIds),
  ])
  await bestEffortRecordUserActivity(pgUserId, 'profile_submitted', {
    source: 'api',
    sourceId: pgUserId,
    dedupeKey: profileDedupeKey,
    metadata: {
      selectedBooksCount: result.addedBookIds.length,
      addedBooksCount: result.addedBooks.length,
    },
  })

  if (result.addedBookIds.length > 0) {
    await bestEffortRecordUserActivity(pgUserId, 'books_selected', {
      source: 'api',
      sourceId: pgUserId,
      dedupeKey: buildUserActivityDedupeKey(['api', 'books_selected', pgUserId, JSON.stringify(result.addedBookIds)]),
      metadata: {
        selectedBooksCount: result.addedBookIds.length,
        addedBooksCount: result.addedBooks.length,
      },
    })
  }

  // Enqueue notification for digest (skip in test mode — tests use the real DB)
  if (result.addedBooks.length > 0 && process.env.NEXTAUTH_TEST_MODE !== 'true') {
    withAuditContext(auditCtx, async (tx) =>
      tx.insert(notificationQueue).values({
        userName: name.trim(),
        userEmail: getUserContactEmail(session.user) ?? '',
        contacts: contacts.trim(),
        addedBooks: JSON.stringify(result.addedBooks),
        isNew: result.isNew,
      }),
    ).catch(() => {
      console.error('Failed to enqueue signup notification')
    })
  }

  if (activeSessionId) {
    await finalizeMatchingMutationEffects({
      sessionId: activeSessionId,
      targetUserId: pgUserId,
      actorUserId: pgUserId,
      bookId: null,
      kind: 'catalog_signup_updated',
      source: 'catalog',
      before,
      metadata: {
        addedBookIds: result.newlyAddedBookIds,
        removedBookIds: result.removedBookIds,
      },
    })
  }
  await broadcastActiveMatchingStateChangeForParticipant(pgUserId)

  return NextResponse.json({ ok: true })
}

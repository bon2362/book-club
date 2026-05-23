import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignup, upsertSignupByBookIds } from '@/lib/signup-books'
import type { UpsertResult } from '@/lib/signup-books'
import { db } from '@/lib/db'
import { bookPriorities, notificationQueue, users } from '@/lib/db/schema'
import { and, eq, isNull, notInArray, or } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'
import { getUserContactEmail } from '@/lib/user-email'

export async function POST(req: NextRequest) {
  const session = await auth()
  const pgUserId = session?.user?.id
  if (!pgUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBooks, selectedBookIds } = body

  const hasBookIds = Array.isArray(selectedBookIds)
  const hasLegacyBookNames = Array.isArray(selectedBooks)
  if (!name?.trim() || typeof contacts !== 'string' || (!hasBookIds && !hasLegacyBookNames)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const selectedBookIdsList = hasBookIds ? selectedBookIds as string[] : []
  const selectedBookNames = hasLegacyBookNames ? selectedBooks as string[] : []
  const selectedCount = hasBookIds ? selectedBookIdsList.length : selectedBookNames.length
  let result: UpsertResult
  try {
    result = hasBookIds
      ? await upsertSignupByBookIds(pgUserId, selectedBookIdsList)
      : await upsertSignup(pgUserId, selectedBookNames)
  } catch {
    return NextResponse.json({ error: 'Some books were not found' }, { status: 400 })
  }

  await db.update(users).set({
    name: name.trim(),
    contacts: contacts.trim(),
    ...(selectedCount === 0 ? { prioritiesSet: false } : {}),
  }).where(eq(users.id, pgUserId))

  // Clean up book_priorities for books no longer in selectedBookIds.
  // Uses session.user.id (Postgres user UUID), not session.user.email (Sheets userId).
  if (result.addedBookIds.length > 0) {
    await db
      .delete(bookPriorities)
      .where(
        and(
          eq(bookPriorities.userId, pgUserId),
          or(
            isNull(bookPriorities.bookId),
            notInArray(bookPriorities.bookId, result.addedBookIds)
          )
        )
      )
      .catch(() => {}) // non-critical — don't fail the request
  } else {
    // All books removed — delete all priorities for this user
    await db
      .delete(bookPriorities)
      .where(eq(bookPriorities.userId, pgUserId))
      .catch(() => {})
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
    db.insert(notificationQueue).values({
      userName: name.trim(),
      userEmail: getUserContactEmail(session.user) ?? '',
      contacts: contacts.trim(),
      addedBooks: JSON.stringify(result.addedBooks),
      isNew: result.isNew,
    }).catch(() => {
      console.error('Failed to enqueue signup notification')
    })
  }

  return NextResponse.json({ ok: true })
}

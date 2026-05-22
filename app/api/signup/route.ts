import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignup } from '@/lib/signup-books'
import { db } from '@/lib/db'
import { bookPriorities, notificationQueue, users } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'
import { getContactEmail } from '@/lib/user-email'

export async function POST(req: NextRequest) {
  const session = await auth()
  const pgUserId = session?.user?.id
  if (!pgUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBooks } = body

  if (!name?.trim() || typeof contacts !== 'string' || !Array.isArray(selectedBooks)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const selectedBookNames = selectedBooks as string[]
  await db.update(users).set({
    name: name.trim(),
    contacts: contacts.trim(),
    ...(selectedBookNames.length === 0 ? { prioritiesSet: false } : {}),
  }).where(eq(users.id, pgUserId))

  const result = await upsertSignup(pgUserId, selectedBookNames)

  // Clean up book_priorities for books no longer in selectedBooks.
  // Uses session.user.id (Postgres user UUID), not session.user.email (Sheets userId).
  if (selectedBookNames.length > 0) {
    await db
      .delete(bookPriorities)
      .where(
        and(
          eq(bookPriorities.userId, pgUserId),
          notInArray(bookPriorities.bookName, selectedBookNames)
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
    JSON.stringify(selectedBookNames),
  ])
  await bestEffortRecordUserActivity(pgUserId, 'profile_submitted', {
    source: 'api',
    sourceId: pgUserId,
    dedupeKey: profileDedupeKey,
    metadata: {
      selectedBooksCount: selectedBookNames.length,
      addedBooksCount: result.addedBooks.length,
    },
  })

  if (selectedBookNames.length > 0) {
    await bestEffortRecordUserActivity(pgUserId, 'books_selected', {
      source: 'api',
      sourceId: pgUserId,
      dedupeKey: buildUserActivityDedupeKey(['api', 'books_selected', pgUserId, JSON.stringify(selectedBookNames)]),
      metadata: {
        selectedBooksCount: selectedBookNames.length,
        addedBooksCount: result.addedBooks.length,
      },
    })
  }

  // Enqueue notification for digest (skip in test mode — tests use the real DB)
  if (result.addedBooks.length > 0 && process.env.NEXTAUTH_TEST_MODE !== 'true') {
    db.insert(notificationQueue).values({
      userName: name.trim(),
      userEmail: getContactEmail(session.user.email) ?? '',
      contacts: contacts.trim(),
      addedBooks: JSON.stringify(result.addedBooks),
      isNew: result.isNew,
    }).catch(() => {
      console.error('Failed to enqueue signup notification')
    })
  }

  return NextResponse.json({ ok: true })
}

// Test-only endpoint: seed/delete deterministic fixture books for the E2E suite.
// Guarded by isTestEndpointAllowed() so it never runs in production.
//
// The Playwright suite calls POST in global setup and DELETE in global teardown
// so fixtures live only for the duration of the E2E run.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { books, signupBooks, bookPriorities } from '@/lib/db/schema'
import { inArray, or } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'
import { TEST_FIXTURE_BOOKS, TEST_FIXTURE_BOOK_IDS, TEST_FIXTURE_BOOK_TITLES } from '@/lib/test-books-fixtures'

export const dynamic = 'force-dynamic'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST() {
  if (!isTestEndpointAllowed()) return notAllowed()

  await db.insert(books).values(TEST_FIXTURE_BOOKS.map(b => ({
    id: b.id,
    title: b.title,
    author: b.author,
    tags: b.tags,
    type: 'book' as const,
    size: '',
    pages: b.pages,
    publishedDate: b.publishedDate,
    textUrl: '',
    description: b.description,
    coverUrl: null,
    whyRead: null,
    recommendationLink: null,
    readingStatus: null,
    visibility: 'published' as const,
    isNew: false,
    sortOrder: -100,
    source: 'admin' as const,
    sourceSubmissionId: null,
    legacySheetsRowId: null,
  }))).onConflictDoNothing()

  return NextResponse.json({ ok: true, ids: TEST_FIXTURE_BOOK_IDS })
}

export async function DELETE() {
  if (!isTestEndpointAllowed()) return notAllowed()

  await db.delete(signupBooks).where(or(
    inArray(signupBooks.bookId, TEST_FIXTURE_BOOK_IDS),
    inArray(signupBooks.bookName, TEST_FIXTURE_BOOK_TITLES)
  ))
  await db.delete(bookPriorities).where(or(
    inArray(bookPriorities.bookId, TEST_FIXTURE_BOOK_IDS),
    inArray(bookPriorities.bookName, TEST_FIXTURE_BOOK_TITLES)
  ))
  await db.delete(books).where(inArray(books.id, TEST_FIXTURE_BOOK_IDS))

  return NextResponse.json({ ok: true })
}

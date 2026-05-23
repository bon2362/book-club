// Test-only endpoint: seed/delete deterministic fixture books for the E2E suite.
// Guarded by isTestEndpointAllowed() so it never runs in production.
//
// The Playwright suite calls POST in global setup and DELETE in global teardown
// so fixtures live only for the duration of the E2E run.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { books, signupBooks, bookPriorities } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

export const dynamic = 'force-dynamic'

export const TEST_FIXTURE_BOOKS = [
  { id: '__test_book_1__', title: 'Тестовая книга 1', author: 'Test Author A', tags: ['государство'], description: 'Книга для e2e-тестов', pages: 100, publishedDate: '2024' },
  { id: '__test_book_2__', title: 'Тестовая книга 2', author: 'Test Author B', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 200, publishedDate: '2024' },
  { id: '__test_book_3__', title: 'Тестовая книга 3', author: 'Test Author C', tags: [] as string[], description: 'Книга для e2e-тестов', pages: 300, publishedDate: '2024' },
]

const TEST_FIXTURE_IDS = TEST_FIXTURE_BOOKS.map(b => b.id)

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

  return NextResponse.json({ ok: true, ids: TEST_FIXTURE_IDS })
}

export async function DELETE() {
  if (!isTestEndpointAllowed()) return notAllowed()

  await db.delete(signupBooks).where(inArray(signupBooks.bookId, TEST_FIXTURE_IDS))
  await db.delete(bookPriorities).where(inArray(bookPriorities.bookId, TEST_FIXTURE_IDS))
  await db.delete(books).where(inArray(books.id, TEST_FIXTURE_IDS))

  return NextResponse.json({ ok: true })
}

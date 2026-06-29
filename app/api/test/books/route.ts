// Test-only endpoint: creates/deletes a single throwaway book on demand.
// Guarded by isTestEndpointAllowed() so it never runs in production.
//
// Called by the `createTestBook` fixture (see e2e/fixtures.ts). Each test
// gets its own book with a unique id (`__e2e_book_<testId>_<index>__`) so
// parallel specs don't fight for the same rows. The fixture removes the
// book in teardown (cascade clears signups / priorities).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { books, matchingLockedCircles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

type BookOverrides = {
  id?: string
  slug?: string
  title?: string
  author?: string
  tags?: string[]
  description?: string
  pages?: number
  publishedDate?: string
  textUrl?: string
  whyRead?: string | null
  recommendationLink?: string | null
  visibility?: 'published' | 'draft' | 'hidden'
  sortOrder?: number
}

function uniqueId() {
  return `__e2e_book_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}__`
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const overrides = (await req.json().catch(() => ({}))) as BookOverrides
  const id = overrides.id ?? uniqueId()
  const title = overrides.title ?? `E2E Book ${id}`

  const [row] = await db
    .insert(books)
    .values({
      id,
      slug: overrides.slug ?? null,
      title,
      author: overrides.author ?? 'E2E Author',
      tags: overrides.tags ?? [],
      type: 'book' as const,
      pages: overrides.pages ?? 100,
      publishedDate: overrides.publishedDate ?? '2024',
      textUrl: overrides.textUrl ?? '',
      description: overrides.description ?? 'E2E test book',
      coverUrl: null,
      whyRead: overrides.whyRead ?? null,
      recommendationLink: overrides.recommendationLink ?? null,
      readingStatus: null,
      visibility: overrides.visibility ?? 'published',
      isNew: false,
      sortOrder: overrides.sortOrder ?? -100,
      source: 'admin' as const,
    })
    .returning()

  return NextResponse.json({ book: row })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // A locked circle intentionally protects its book with ON DELETE RESTRICT.
  // Test teardown removes that disposable matching state first; its members
  // cascade, then the usual book cascades clear signups and priorities.
  // eslint-disable-next-line no-restricted-syntax -- isolated test-only cleanup transaction
  await db.transaction(async (tx) => {
    await tx.delete(matchingLockedCircles).where(eq(matchingLockedCircles.bookId, id))
    await tx.delete(books).where(eq(books.id, id))
  })
  return NextResponse.json({ ok: true })
}

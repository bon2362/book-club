export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Backwards-compatible endpoint: bookId is now books.id (UUID). The endpoint
// updates books.reading_status directly — the legacy book_statuses table is
// retired (data was merged into books in migration 0021 and the table will be
// dropped in 0022).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { bookId, status } = await req.json() as { bookId: string; status: string }
  if (!bookId || !['reading', 'read'].includes(status)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  await db
    .update(books)
    .set({ readingStatus: status, updatedAt: new Date() })
    .where(eq(books.id, bookId))

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookId = req.nextUrl.searchParams.get('bookId')
  if (!bookId) {
    return NextResponse.json({ error: 'Missing bookId' }, { status: 400 })
  }

  await db
    .update(books)
    .set({ readingStatus: null, updatedAt: new Date() })
    .where(eq(books.id, bookId))

  return NextResponse.json({ ok: true })
}

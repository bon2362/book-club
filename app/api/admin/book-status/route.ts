export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookStatuses } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS book_statuses (
      book_id text PRIMARY KEY,
      status  text NOT NULL
    )
  `)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { bookId, status } = await req.json() as { bookId: string; status: string }
  if (!bookId || !['reading', 'read'].includes(status)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  await ensureTable()
  await db.insert(bookStatuses).values({ bookId, status }).onConflictDoUpdate({
    target: bookStatuses.bookId,
    set: { status },
  })

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

  await ensureTable()
  await db.delete(bookStatuses).where(eq(bookStatuses.bookId, bookId))

  return NextResponse.json({ ok: true })
}

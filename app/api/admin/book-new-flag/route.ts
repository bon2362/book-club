import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) return null
  return session
}

// books.is_new is now the source of truth — book_new_flags has been retired.
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { bookId, isNew } = await req.json()
  if (!bookId || typeof isNew !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  await db.update(books).set({ isNew, updatedAt: new Date() }).where(eq(books.id, bookId))

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const bookId = req.nextUrl.searchParams.get('bookId')
  if (!bookId) return NextResponse.json({ error: 'Missing bookId' }, { status: 400 })

  await db.update(books).set({ isNew: false, updatedAt: new Date() }).where(eq(books.id, bookId))
  return NextResponse.json({ success: true })
}

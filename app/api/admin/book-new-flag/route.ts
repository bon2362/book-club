import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookNewFlags } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) return null
  return session
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { bookId, isNew } = await req.json()
  if (!bookId || typeof isNew !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  await db.insert(bookNewFlags)
    .values({ bookId, isNew, updatedAt: new Date() })
    .onConflictDoUpdate({ target: bookNewFlags.bookId, set: { isNew, updatedAt: new Date() } })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const bookId = req.nextUrl.searchParams.get('bookId')
  if (!bookId) return NextResponse.json({ error: 'Missing bookId' }, { status: 400 })

  await db.delete(bookNewFlags).where(eq(bookNewFlags.bookId, bookId))
  return NextResponse.json({ success: true })
}

export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const VALID_STATUSES = new Set(['reading', 'read'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { bookId: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { status } = body ?? {}

  if (status !== null && status !== undefined && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status. Expected "reading", "read", or null.' }, { status: 400 })
  }

  const { bookId } = params
  const userId = session.user.id

  // Verify user is signed up for this book
  const [signup] = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)

  if (!signup) {
    return NextResponse.json({ error: 'Not signed up for this book' }, { status: 404 })
  }

  await db
    .update(signupBooks)
    .set({ personalStatus: status ?? null })
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))

  return NextResponse.json({ ok: true })
}

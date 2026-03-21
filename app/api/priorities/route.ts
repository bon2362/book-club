export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, users } from '@/lib/db/schema'
import { eq, asc, and, notInArray, sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const rows = await db
    .select({ bookName: bookPriorities.bookName, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
    .orderBy(asc(bookPriorities.rank))

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session!.user as { id: string }).id

  const body = await req.json()
  const { books } = body as { books: unknown }

  if (
    !Array.isArray(books) ||
    books.length === 0 ||
    books.some(b => typeof b !== 'string' || !b.trim())
  ) {
    return NextResponse.json({ error: 'books must be a non-empty array of strings' }, { status: 400 })
  }

  const validBooks = (books as string[]).map(b => b.trim()).filter(Boolean)
  const now = new Date()

  await db
    .insert(bookPriorities)
    .values(
      validBooks.map((bookName, index) => ({
        userId,
        bookName,
        rank: index + 1,
        updatedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [bookPriorities.userId, bookPriorities.bookName],
      set: {
        rank: sql`excluded.rank`,
        updatedAt: now,
      },
    })

  await db
    .delete(bookPriorities)
    .where(
      and(
        eq(bookPriorities.userId, userId),
        notInArray(bookPriorities.bookName, validBooks)
      )
    )

  await db
    .update(users)
    .set({ prioritiesSet: true })
    .where(eq(users.id, userId))

  revalidatePath('/admin')

  return NextResponse.json({ ok: true })
}

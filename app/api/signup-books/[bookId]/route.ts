import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books, signupBooks, users } from '@/lib/db/schema'
import { saveSignupSelection, type AuthSession } from '@/lib/signup-selection'

export const dynamic = 'force-dynamic'

type Params = { params: { bookId: string } }

async function loadProfile(userId: string) {
  const [user] = await db
    .select({ name: users.name, contacts: users.contacts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const name = user?.name?.trim() ?? ''
  const contacts = user?.contacts?.trim() ?? ''
  return name && contacts ? { name, contacts } : null
}

async function currentBookIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(eq(signupBooks.userId, userId))
  return rows.map((row) => row.bookId)
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [book] = await db
    .select({ id: books.id, visibility: books.visibility })
    .from(books)
    .where(eq(books.id, params.bookId))
    .limit(1)
  if (!book || book.visibility !== 'published') return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const profile = await loadProfile(session.user.id)
  if (!profile) return NextResponse.json({ error: 'contacts_required' }, { status: 409 })

  const selected = await currentBookIds(session.user.id)
  if (selected.includes(params.bookId)) return NextResponse.json({ ok: true, alreadySelected: true })

  return saveSignupSelection(session as AuthSession, {
    ...profile,
    selectedBookIds: [...selected, params.bookId],
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await loadProfile(session.user.id)
  if (!profile) return NextResponse.json({ error: 'contacts_required' }, { status: 409 })

  const selected = await currentBookIds(session.user.id)
  if (!selected.includes(params.bookId)) return NextResponse.json({ ok: true, alreadyRemoved: true })

  return saveSignupSelection(session as AuthSession, {
    ...profile,
    selectedBookIds: selected.filter((id) => id !== params.bookId),
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, signupBooks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [activeSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (!activeSession) return NextResponse.json({ error: 'No active session' }, { status: 404 })
  if (activeSession.status === 'frozen') return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })

  await db
    .insert(signupBooks)
    .values({ userId: session.user.id, bookId })
    .onConflictDoNothing()

  return NextResponse.json({ ok: true }, { status: 200 })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(bookSubmissions)
    .where(and(eq(bookSubmissions.id, params.id), eq(bookSubmissions.userId, session.user.id)))
    .limit(1)

  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(bookSubmissions).where(eq(bookSubmissions.id, params.id))

  return NextResponse.json({ ok: true })
}

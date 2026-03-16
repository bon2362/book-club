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

  const deleted = await db
    .delete(bookSubmissions)
    .where(and(eq(bookSubmissions.id, params.id), eq(bookSubmissions.userId, session.user.id)))
    .returning()

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

function isValidUserId(value: string) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await req.json() as { userId: string }
  if (!userId || !isValidUserId(userId)) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  await db.delete(users).where(eq(users.id, userId))

  return NextResponse.json({ ok: true })
}

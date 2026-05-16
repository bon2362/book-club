export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { markSignupDeletedByAdmin } from '@/lib/signups'

function isValidUserId(value: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const telegram = /^telegram:\d+$/
  const testUser = process.env.NEXTAUTH_TEST_MODE === 'true' && /^test:.+@.+$/.test(value)
  return uuid.test(value) || telegram.test(value) || testUser
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, signupUserId } = await req.json() as { userId: string; signupUserId?: string }
  if (!userId || !isValidUserId(userId)) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  await Promise.all([
    db.delete(users).where(eq(users.id, userId)),
    markSignupDeletedByAdmin(signupUserId ?? userId),
  ])

  return NextResponse.json({ ok: true })
}

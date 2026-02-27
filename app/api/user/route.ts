export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { markSignupDeleted } from '@/lib/signups'

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await Promise.all([
    db.delete(users).where(eq(users.email, session.user.email)),
    markSignupDeleted(session.user.email),
  ])

  return NextResponse.json({ ok: true })
}

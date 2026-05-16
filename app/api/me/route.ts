export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      contacts: users.contacts,
      telegramUsername: users.telegramUsername,
      authProvider: users.authProvider,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user: rows[0] })
}

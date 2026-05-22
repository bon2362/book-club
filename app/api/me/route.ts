export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userIdentities, users } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.contactEmail,
      contactEmail: users.contactEmail,
      contacts: users.contacts,
      telegramUsername: users.telegramUsername,
      legacyAuthProvider: users.authProvider,
      legacyLastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const identities = await db
    .select({
      authProvider: userIdentities.provider,
      lastSignInAt: userIdentities.lastSeenAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, session.user.id))
    .orderBy(desc(userIdentities.lastSeenAt))
    .limit(1)

  return NextResponse.json({
    user: {
      ...rows[0],
      authProvider: identities[0]?.authProvider ?? rows[0].legacyAuthProvider ?? null,
      lastSignInAt: identities[0]?.lastSignInAt ?? rows[0].legacyLastSignInAt ?? null,
      legacyAuthProvider: undefined,
      legacyLastSignInAt: undefined,
    },
  })
}

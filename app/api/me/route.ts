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
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const identities = await db
    .select({
      provider: userIdentities.provider,
      providerAccountId: userIdentities.providerAccountId,
      email: userIdentities.email,
      telegramUsername: userIdentities.telegramUsername,
      lastSeenAt: userIdentities.lastSeenAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, session.user.id))
    .orderBy(desc(userIdentities.lastSeenAt))
    .limit(50)

  const authMethods = identities.map(identity => ({
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
    email: identity.email,
    telegramUsername: identity.telegramUsername,
    lastSeenAt: identity.lastSeenAt,
  }))

  return NextResponse.json({
    user: {
      ...rows[0],
      authProvider: identities[0]?.provider ?? null,
      lastSignInAt: identities[0]?.lastSeenAt ?? null,
      authMethods,
      identities,
    },
  })
}

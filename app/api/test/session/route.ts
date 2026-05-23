// Test-only endpoint: creates a session cookie directly without email/OAuth.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.

import { NextRequest, NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { db } from '@/lib/db'
import { notificationQueue, userIdentities, users } from '@/lib/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'
import { normalizeIdentityProvider, resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { email, name, isAdmin, telegramUsername, provider, providerAccountId } = await req.json() as {
    email?: string; name: string; isAdmin?: boolean; telegramUsername?: string; provider?: string; providerAccountId?: string
  }
  const identityProvider = normalizeIdentityProvider(provider ?? 'email')
  const identityAccountId = providerAccountId ?? (identityProvider === 'telegram' ? telegramUsername ?? email : email)
  const identityEmail = identityProvider === 'telegram' ? null : email
  if (!identityAccountId) {
    return NextResponse.json({ error: 'Missing identity account id' }, { status: 400 })
  }

  const user = await resolveOrCreateUserFromIdentity(identityProvider, identityAccountId, {
    email: identityEmail,
    name,
    emailVerified: identityProvider !== 'telegram',
    telegramUsername: telegramUsername ?? null,
    isAdmin: isAdmin ?? false,
    metadata: { source: 'test-session' },
  })

  await db.update(users).set({
    name,
    emailVerified: identityProvider === 'telegram' ? null : new Date(),
    isAdmin: isAdmin ?? false,
  }).where(eq(users.id, user.id))

  const token = await encode({
    token: { sub: user.id, email: user.email ?? identityEmail ?? null, name, isAdmin: isAdmin ?? false, provider: identityProvider, contactEmail: user.contactEmail },
    secret: (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)!,
    salt: 'authjs.session-token',
  })

  const res = NextResponse.json({ ok: true, userId: user.id })
  res.cookies.set('authjs.session-token', token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 86400,
  })
  return res
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { email, provider, providerAccountId, telegramUsername } = await req.json() as {
    email?: string
    provider?: string
    providerAccountId?: string
    telegramUsername?: string
  }
  const identityProvider = provider ? normalizeIdentityProvider(provider) : null
  const identityAccountId = providerAccountId ?? telegramUsername ?? email
  const userRows = email ? await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.contactEmail, email))
    .limit(1) : []
  const identityRows = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(identityProvider && identityAccountId
      ? and(eq(userIdentities.provider, identityProvider), eq(userIdentities.providerAccountId, identityAccountId))
      : or(
        eq(userIdentities.email, email ?? ''),
        eq(userIdentities.providerAccountId, identityAccountId ?? '')
      ))
    .limit(1)
  const userId = userRows[0]?.id ?? identityRows[0]?.userId ?? null

  if (email) await db.delete(notificationQueue).where(eq(notificationQueue.userEmail, email))
  if (userId) {
    await db.delete(userIdentities).where(eq(userIdentities.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('authjs.session-token')
  return res
}

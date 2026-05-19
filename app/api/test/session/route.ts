// Test-only endpoint: creates a session cookie directly without email/OAuth.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.

import { NextRequest, NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { db } from '@/lib/db'
import { notificationQueue, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'
import { normalizeIdentityProvider, resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { email, name, isAdmin, telegramUsername, provider, providerAccountId } = await req.json() as {
    email: string; name: string; isAdmin?: boolean; telegramUsername?: string; provider?: string; providerAccountId?: string
  }
  const identityProvider = normalizeIdentityProvider(provider ?? 'email')
  const identityAccountId = providerAccountId ?? (identityProvider === 'telegram' ? telegramUsername ?? email : email)

  const user = await resolveOrCreateUserFromIdentity(identityProvider, identityAccountId, {
    email,
    name,
    emailVerified: identityProvider !== 'telegram',
    telegramUsername: telegramUsername ?? null,
    isAdmin: isAdmin ?? false,
    metadata: { source: 'test-session' },
  })

  await db.update(users).set({
    name,
    authProvider: provider ?? 'email',
    telegramUsername: telegramUsername ?? null,
    lastSignInAt: new Date(),
    emailVerified: new Date(),
    isAdmin: isAdmin ?? false,
  }).where(eq(users.id, user.id))

  const token = await encode({
    token: { sub: user.id, email, name, isAdmin: isAdmin ?? false, telegramUsername: telegramUsername ?? null, provider: provider ?? null },
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

  const { email } = await req.json() as { email: string }
  await db.delete(notificationQueue).where(eq(notificationQueue.userEmail, email))
  await db.delete(users).where(eq(users.email, email))

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('authjs.session-token')
  return res
}

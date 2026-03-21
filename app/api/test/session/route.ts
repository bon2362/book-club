// Test-only endpoint: creates a session cookie directly without email/OAuth.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.

import { NextRequest, NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { db } from '@/lib/db'
import { users, notificationQueue } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { email, name, isAdmin, telegramUsername, provider } = await req.json() as {
    email: string; name: string; isAdmin?: boolean; telegramUsername?: string; provider?: string
  }

  await db.insert(users).values({ id: `test:${email}`, email, name, emailVerified: new Date() })
    .onConflictDoNothing()

  const token = await encode({
    token: { sub: `test:${email}`, email, name, isAdmin: isAdmin ?? false, telegramUsername: telegramUsername ?? null, provider: provider ?? null },
    secret: (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)!,
    salt: 'authjs.session-token',
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('authjs.session-token', token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 86400,
  })
  return res
}

export async function DELETE(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { email } = await req.json() as { email: string }
  await db.delete(notificationQueue).where(eq(notificationQueue.userEmail, email))
  await db.delete(users).where(eq(users.email, email))

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('authjs.session-token')
  return res
}

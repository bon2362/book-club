// Test-only endpoint: writes/removes signup_books rows directly.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.
// Used for E2E tests that need the admin panel to show test users.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks, userIdentities, users } from '@/lib/db/schema'
import { upsertSignup } from '@/lib/signup-books'
import { eq, or } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { userId, name, email, contacts, selectedBooks } = await req.json() as {
    userId: string; name: string; email: string; contacts: string; selectedBooks: string[]
  }
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.contactEmail, email))
    .limit(1)
  const identityRows = rows[0]?.id ? [] : await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(or(eq(userIdentities.email, email), eq(userIdentities.providerAccountId, email)))
    .limit(1)
  const canonicalUserId = rows[0]?.id ?? identityRows[0]?.userId ?? userId

  await db.update(users).set({ name, contacts }).where(eq(users.id, canonicalUserId))
  await upsertSignup(canonicalUserId, selectedBooks)

  return NextResponse.json({ ok: true, userId: canonicalUserId })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { userId } = await req.json() as { userId: string }
  await db.delete(signupBooks).where(eq(signupBooks.userId, userId))

  return NextResponse.json({ ok: true })
}

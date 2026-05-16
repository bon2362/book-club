// Test-only endpoint: writes/removes signup_books rows directly.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.
// Used for E2E tests that need the admin panel to show test users.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks, users } from '@/lib/db/schema'
import { upsertSignup } from '@/lib/signup-books'
import { eq } from 'drizzle-orm'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { userId, name, contacts, selectedBooks } = await req.json() as {
    userId: string; name: string; email: string; contacts: string; selectedBooks: string[]
  }

  await db.update(users).set({ name, contacts }).where(eq(users.id, userId))
  await upsertSignup(userId, selectedBooks)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { userId } = await req.json() as { userId: string }
  await db.delete(signupBooks).where(eq(signupBooks.userId, userId))

  return NextResponse.json({ ok: true })
}

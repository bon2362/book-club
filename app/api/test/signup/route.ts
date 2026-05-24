// Test-only endpoint: writes/removes signup_books rows directly.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.
// Used for E2E tests that need the admin panel to show test users.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signupBooks, userIdentities, users, books } from '@/lib/db/schema'
import { upsertSignupByBookIds } from '@/lib/signup-books'
import { eq, inArray, or } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

// E2E suite passes book titles for convenience (test fixtures are seeded with
// stable titles). Resolve them to book_id here so the runtime stays book_id-only.
async function resolveTitlesToIds(titles: string[]): Promise<string[]> {
  const unique = Array.from(new Set(titles.map(t => t.trim()).filter(Boolean)))
  if (unique.length === 0) return []
  const rows = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(inArray(books.title, unique))
  const byTitle = new Map(rows.map(r => [r.title, r.id]))
  return unique.flatMap(t => {
    const id = byTitle.get(t)
    return id ? [id] : []
  })
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { userId, name, email, contacts, selectedBooks, selectedBookIds } = await req.json() as {
    userId: string; name: string; email: string; contacts: string
    selectedBooks?: string[]; selectedBookIds?: string[]
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
  const bookIds = Array.isArray(selectedBookIds) && selectedBookIds.length > 0
    ? selectedBookIds
    : await resolveTitlesToIds(selectedBooks ?? [])
  await upsertSignupByBookIds(canonicalUserId, bookIds)

  return NextResponse.json({ ok: true, userId: canonicalUserId })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { userId } = await req.json() as { userId: string }
  await db.delete(signupBooks).where(eq(signupBooks.userId, userId))

  return NextResponse.json({ ok: true })
}

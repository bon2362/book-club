import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accounts, sessions, signupBooks, userIdentities, users } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const email = req.nextUrl.searchParams.get('email')
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const rows = await db
    .select({ id: users.id, email: users.contactEmail, contactEmail: users.contactEmail })
    .from(users)
    .where(eq(users.contactEmail, email))
    .limit(1)

  let userRow = rows[0]
  if (!userRow) {
    const identityRows = await db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(or(eq(userIdentities.email, email), eq(userIdentities.providerAccountId, email)))
      .limit(1)
    if (identityRows[0]?.userId) {
      const byIdentityRows = await db
        .select({ id: users.id, email: users.contactEmail, contactEmail: users.contactEmail })
        .from(users)
        .where(eq(users.id, identityRows[0].userId))
        .limit(1)
      userRow = byIdentityRows[0]
    }
  }

  if (!userRow) {
    return NextResponse.json({ exists: false, accountCount: 0, sessionCount: 0, signupBookCount: 0 })
  }

  const userId = userRow.id
  const [accountRows, sessionRows, signupBookRows, identityRows] = await Promise.all([
    db.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.userId, userId)),
    db.select({ bookId: signupBooks.bookId, bookName: signupBooks.bookName }).from(signupBooks).where(eq(signupBooks.userId, userId)),
    db
      .select({
        provider: userIdentities.provider,
        providerAccountId: userIdentities.providerAccountId,
        userId: userIdentities.userId,
      })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId)),
  ])

  return NextResponse.json({
    exists: true,
    user: userRow,
    accountCount: accountRows.length,
    identityCount: identityRows.length,
    identities: identityRows,
    sessionCount: sessionRows.length,
    signupBookCount: signupBookRows.length,
    signupBooks: signupBookRows.map(row => row.bookName),
    signupBookIds: signupBookRows.map(row => row.bookId).filter(Boolean),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accounts, sessions, signupBooks, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (rows.length === 0) {
    return NextResponse.json({ exists: false, accountCount: 0, sessionCount: 0, signupBookCount: 0 })
  }

  const userId = rows[0].id
  const [accountRows, sessionRows, signupBookRows] = await Promise.all([
    db.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.userId, userId)),
    db.select({ bookName: signupBooks.bookName }).from(signupBooks).where(eq(signupBooks.userId, userId)),
  ])

  return NextResponse.json({
    exists: true,
    user: rows[0],
    accountCount: accountRows.length,
    sessionCount: sessionRows.length,
    signupBookCount: signupBookRows.length,
    signupBooks: signupBookRows.map(row => row.bookName),
  })
}

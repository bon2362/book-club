import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accounts, sessions, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

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
    return NextResponse.json({ exists: false, accountCount: 0, sessionCount: 0 })
  }

  const userId = rows[0].id
  const [accountRows, sessionRows] = await Promise.all([
    db.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.userId, userId)),
  ])

  return NextResponse.json({
    exists: true,
    user: rows[0],
    accountCount: accountRows.length,
    sessionCount: sessionRows.length,
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllSignups } from '@/lib/signups'
import { db } from '@/lib/db'
import { bookPriorities, users } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookName = req.nextUrl.searchParams.get('book')
  if (!bookName) {
    return NextResponse.json({ error: 'Missing book parameter' }, { status: 400 })
  }

  const signups = await getAllSignups()
  const bookSignups = signups.filter(s => s.selectedBooks.includes(bookName))

  if (bookSignups.length === 0) {
    return NextResponse.json({ users: [] })
  }

  // NOTE: userId in Google Sheets signups stores the user's email (session.user.email),
  // NOT the Postgres UUID. We must look up users by email to get their Postgres IDs
  // for querying bookPriorities (which uses Postgres UUID as userId).
  const signupEmails = bookSignups.map(s => s.userId) // userId in sheets = email

  // Fetch Postgres users by email to get their IDs and prioritiesSet flag
  const userRows = await db
    .select({ id: users.id, email: users.email, prioritiesSet: users.prioritiesSet })
    .from(users)
    .where(inArray(users.email, signupEmails))

  // Map email → { id, prioritiesSet }
  const userByEmail = Object.fromEntries(userRows.map(r => [r.email, r]))

  // Collect Postgres user IDs for priority lookup
  const pgUserIds = userRows.map(r => r.id)

  // Fetch priority rows for this specific book
  const priorityRows = pgUserIds.length > 0
    ? await db
        .select({
          userId: bookPriorities.userId,
          rank: bookPriorities.rank,
          updatedAt: bookPriorities.updatedAt,
        })
        .from(bookPriorities)
        .where(
          and(
            eq(bookPriorities.bookName, bookName),
            inArray(bookPriorities.userId, pgUserIds)
          )
        )
    : []

  // Map Postgres userId → priority info
  const priorityByPgId = Object.fromEntries(
    priorityRows.map(r => [r.userId, { rank: r.rank, updatedAt: r.updatedAt }])
  )

  const result = bookSignups.map(s => {
    const pgUser = userByEmail[s.userId] // userId in sheets = email
    const pgId = pgUser?.id
    const prioritiesSet = pgUser?.prioritiesSet ?? false
    const priorityInfo = pgId ? priorityByPgId[pgId] : undefined

    return {
      ...s,
      priority: priorityInfo?.rank ?? null,
      totalBooks: prioritiesSet ? s.selectedBooks.length : null,
      prioritiesSet,
      priorityUpdatedAt: priorityInfo?.updatedAt ?? null,
    }
  })

  // Sort: prioritiesSet=true first (by rank ASC, then updatedAt ASC), then prioritiesSet=false
  result.sort((a, b) => {
    if (a.prioritiesSet && !b.prioritiesSet) return -1
    if (!a.prioritiesSet && b.prioritiesSet) return 1
    if (a.priority !== null && b.priority !== null) {
      if (a.priority !== b.priority) return a.priority - b.priority
      const aTime = a.priorityUpdatedAt ? new Date(a.priorityUpdatedAt).getTime() : 0
      const bTime = b.priorityUpdatedAt ? new Date(b.priorityUpdatedAt).getTime() : 0
      return aTime - bTime
    }
    return 0
  })

  return NextResponse.json({ users: result })
}

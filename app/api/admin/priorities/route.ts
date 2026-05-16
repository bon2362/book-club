export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllSignups } from '@/lib/signup-books'
import { db } from '@/lib/db'
import { bookPriorities } from '@/lib/db/schema'
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

  const userIds = bookSignups.map(s => s.userId)

  // Fetch priority rows for this specific book
  const priorityRows = userIds.length > 0
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
            inArray(bookPriorities.userId, userIds)
          )
        )
    : []

  // Map Postgres userId → priority info
  const priorityByPgId = Object.fromEntries(
    priorityRows.map(r => [r.userId, { rank: r.rank, updatedAt: r.updatedAt }])
  )

  const result = bookSignups.map(s => {
    const prioritiesSet = s.prioritiesSet ?? false
    const priorityInfo = priorityByPgId[s.userId]

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

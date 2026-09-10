export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { buildCoordinationRadar } from '@/lib/matching/coordination-radar'

interface Params { params: { id: string } }

// Read-only радар спроса по книгам для координатора. Только чтение, никаких мутаций:
// агрегаты по чужим спискам видит только админ.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId } = params

  const [matchingSession] = await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      deadlineAt: matchingSessions.deadlineAt,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)
  if (!matchingSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const participants = await db
    .select({
      userId: matchingSessionParticipants.userId,
      completedAt: matchingSessionParticipants.completedAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const activeIds = participants.filter((participant) => participant.completedAt == null).map((participant) => participant.userId)

  // inArray с пустым списком Drizzle превращает в `false`, отдельная ветка не нужна.
  const [wishlist, reading, intents, assignments, circles] = await Promise.all([
    db.select({
      userId: signupBooks.userId,
      bookId: signupBooks.bookId,
      title: books.title,
      author: books.author,
      rank: bookPriorities.rank,
    })
      .from(signupBooks)
      .innerJoin(books, eq(signupBooks.bookId, books.id))
      .leftJoin(bookPriorities, and(
        eq(bookPriorities.userId, signupBooks.userId),
        eq(bookPriorities.bookId, signupBooks.bookId),
      ))
      .where(and(inArray(signupBooks.userId, activeIds), isNull(signupBooks.personalStatus))),
    db.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, title: books.title })
      .from(signupBooks)
      .innerJoin(books, eq(signupBooks.bookId, books.id))
      .where(and(inArray(signupBooks.userId, activeIds), eq(signupBooks.personalStatus, 'reading'))),
    db.select({ userId: matchingBookIntents.userId, bookId: matchingBookIntents.bookId, kind: matchingBookIntents.kind })
      .from(matchingBookIntents)
      .where(eq(matchingBookIntents.sessionId, sessionId)),
    db.select({
      userId: matchingBookAssignments.userId,
      bookId: matchingBookAssignments.bookId,
      circleId: matchingBookAssignments.circleId,
    })
      .from(matchingBookAssignments)
      .where(eq(matchingBookAssignments.sessionId, sessionId)),
    db.select({ id: matchingCircles.id, bookId: matchingCircles.bookId })
      .from(matchingCircles)
      .where(eq(matchingCircles.sessionId, sessionId)),
  ])

  const radar = buildCoordinationRadar({ participants, wishlist, reading, intents, assignments, circles })

  return NextResponse.json({
    session: {
      id: matchingSession.id,
      title: matchingSession.name,
      status: matchingSession.status,
      deadlineAt: matchingSession.deadlineAt?.toISOString() ?? null,
    },
    ...radar,
  })
}

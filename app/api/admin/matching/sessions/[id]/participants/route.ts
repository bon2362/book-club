export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingSessionParticipants,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'
import { fetchOnlineParticipantRefs } from '@/lib/matching/presence'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId } = params

  const participants = await db
    .select({
      userId: matchingSessionParticipants.userId,
      publicRef: matchingSessionParticipants.publicRef,
      joinSource: matchingSessionParticipants.joinSource,
      joinedAt: matchingSessionParticipants.joinedAt,
      completedAt: matchingSessionParticipants.completedAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, sessionId))
    .orderBy(matchingSessionParticipants.joinedAt)

  const [assignmentRows, intentRows, personalListRows] = await Promise.all([
    db.select({ userId: matchingBookAssignments.userId, title: books.title })
      .from(matchingBookAssignments)
      .innerJoin(books, eq(matchingBookAssignments.bookId, books.id))
      .where(eq(matchingBookAssignments.sessionId, sessionId)),
    db.select({ userId: matchingBookIntents.userId, kind: matchingBookIntents.kind, title: books.title })
      .from(matchingBookIntents)
      .innerJoin(books, eq(matchingBookIntents.bookId, books.id))
      .where(eq(matchingBookIntents.sessionId, sessionId)),
    // Полный личный список участника: «Хочу читать» с рангами и то, что он читает сейчас.
    // Нужен админу, чтобы видеть выбор человека целиком, а не только книги с пересечениями.
    db.select({
      userId: signupBooks.userId,
      title: books.title,
      personalStatus: signupBooks.personalStatus,
      rank: bookPriorities.rank,
    })
      .from(signupBooks)
      .innerJoin(books, eq(signupBooks.bookId, books.id))
      .leftJoin(bookPriorities, and(
        eq(bookPriorities.userId, signupBooks.userId),
        eq(bookPriorities.bookId, signupBooks.bookId),
      ))
      .where(and(
        inArray(signupBooks.userId, participants.map((participant) => participant.userId)),
        or(isNull(signupBooks.personalStatus), eq(signupBooks.personalStatus, 'reading')),
      )),
  ])
  const assignedUserIds = new Set(assignmentRows.map((row) => row.userId))
  const choicesByUserId = new Map(participants.map((participant) => [participant.userId, {
    hard: [] as string[],
    conditional: [] as string[],
    assigned: [] as string[],
  }]))
  for (const row of assignmentRows) choicesByUserId.get(row.userId)?.assigned.push(row.title)
  for (const row of intentRows) choicesByUserId.get(row.userId)?.[row.kind].push(row.title)
  const wishlistByUserId = new Map<string, Array<{ title: string; rank: number | null }>>()
  const readingByUserId = new Map<string, string[]>()
  for (const row of personalListRows) {
    if (row.personalStatus === 'reading') {
      readingByUserId.set(row.userId, [...(readingByUserId.get(row.userId) ?? []), row.title])
    } else {
      wishlistByUserId.set(row.userId, [...(wishlistByUserId.get(row.userId) ?? []), { title: row.title, rank: row.rank }])
    }
  }
  const data = participants.map((participant) => ({
    ...participant,
    role: assignedUserIds.has(participant.userId) ? ('observer' as const) : ('active' as const),
    choices: choicesByUserId.get(participant.userId)!,
    wishlist: (wishlistByUserId.get(participant.userId) ?? []).sort((a, b) => (
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title, 'ru')
    )),
    readingNow: (readingByUserId.get(participant.userId) ?? []).sort((a, b) => a.localeCompare(b, 'ru')),
  }))

  // Онлайн-статус — best-effort: если колонка last_seen_at ещё не накатана, не падаем.
  let online: string[] = []
  try {
    online = await fetchOnlineParticipantRefs(sessionId)
  } catch {
    online = []
  }

  return NextResponse.json({ success: true, data, online })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
      },
      action: { type: 'admin_add', userId },
    })
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error) {
    return transitionError(error)
  }
}

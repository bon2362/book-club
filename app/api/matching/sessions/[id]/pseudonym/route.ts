export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { rerollPseudonymReservation } from '@/lib/matching/pseudonym-reservations'

interface Params { params: { id: string } }

// POST — перевыбрать предварительный ник на новый случайный (до вступления в сессию).
export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const { id: sessionId } = params

  const [matchingSession] = await db
    .select({ id: matchingSessions.id, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchingSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (matchingSession.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
  }

  // Уже вступил — ник зафиксирован, менять нельзя.
  const [participant] = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )
    .limit(1)

  if (participant) {
    return NextResponse.json({ error: 'Already joined' }, { status: 409 })
  }

  try {
    const pseudonym = await rerollPseudonymReservation(sessionId, userId)
    return NextResponse.json({ pseudonym }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Не удалось подобрать ник' }, { status: 500 })
  }
}

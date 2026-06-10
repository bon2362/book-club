export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { assignPseudonym } from '@/lib/matching/pseudonyms'
import { bumpSessionState } from '@/lib/matching/realtime/version'
import { consumePseudonymReservation } from '@/lib/matching/pseudonym-reservations'
import { withAuditContext } from '@/lib/audit/with-audit-context'

interface Params { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const { id: sessionId } = params

  // Load matching session
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

  // Check if already joined
  const [existing] = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )
    .limit(1)

  if (existing) {
    return NextResponse.json({ success: true, pseudonym: existing.pseudonym }, { status: 200 })
  }

  // Assign a new unique pseudonym, preferring the welcome-screen reservation.
  const taken = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const takenSet = new Set(taken.map(r => r.pseudonym))
  const reserved = await consumePseudonymReservation(sessionId, userId)
  const pseudonym = reserved && !takenSet.has(reserved)
    ? reserved
    : assignPseudonym(takenSet)

  await withAuditContext(
    {
      actorUserId: userId,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'matching',
    },
    async (tx) =>
      tx.insert(matchingSessionParticipants).values({
        sessionId,
        userId,
        pseudonym,
      }),
  )

  await bumpSessionState(sessionId)

  return NextResponse.json({ success: true, pseudonym }, { status: 201 })
}

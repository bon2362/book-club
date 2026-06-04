export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'
import { recordParticipantLeftEvent } from '@/lib/matching/preference-events'

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
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

  // Record the analytics event BEFORE deleting the participant row (pseudonym
  // is captured there and the membership guard needs the row to still exist).
  await recordParticipantLeftEvent({
    sessionId,
    userId,
    actorUserId: userId,
    source: 'matching',
  }).catch(() => {}) // analytics must never block the leave action

  await db
    .delete(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )

  broadcast(sessionId, 'state_changed', { userId, kind: 'participant_left' })

  return NextResponse.json({ success: true })
}

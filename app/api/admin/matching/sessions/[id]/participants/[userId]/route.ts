export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'

interface Params { params: { id: string; userId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId, userId } = params

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

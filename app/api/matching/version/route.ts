export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessionParticipants, matchingSessions } from '@/lib/db/schema'
import { touchAndGetOnlinePseudonyms } from '@/lib/matching/presence'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(req.url).searchParams.get('session')
  if (!sessionId) return NextResponse.json({ error: 'session param required' }, { status: 400 })

  const [matchingSession] = await db
    .select({
      id: matchingSessions.id,
      version: matchingSessions.stateVersion,
      status: matchingSessions.status,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (!session.user.isAdmin) {
    const [participant] = await db
      .select({ userId: matchingSessionParticipants.userId })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, sessionId),
          eq(matchingSessionParticipants.userId, session.user.id),
        ),
      )
      .limit(1)

    if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  // Присутствие (#338): heartbeat звонящего + список онлайн-псевдонимов.
  // try/catch — если колонка last_seen_at ещё не накатана на проде, version/status
  // продолжают работать, presence просто пуст.
  let online: string[] = []
  try {
    online = await touchAndGetOnlinePseudonyms(sessionId, session.user.id)
  } catch {
    online = []
  }

  return NextResponse.json({ version: matchingSession.version, status: matchingSession.status, online })
}

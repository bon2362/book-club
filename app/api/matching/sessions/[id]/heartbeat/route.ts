export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { touch, getOnline } from '@/lib/matching/realtime/presence'
import { broadcast } from '@/lib/matching/realtime/hub'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [participant] = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, params.id),
        eq(matchingSessionParticipants.userId, session.user.id),
      ),
    )
    .limit(1)

  // Validate session exists
  const [matchSession] = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Only session participants get presence tracking (not impersonating admins)
  if (participant) {
    const prevOnline = getOnline(params.id)
    touch(params.id, session.user.id, participant.pseudonym)
    const newOnline = getOnline(params.id)
    if (JSON.stringify(prevOnline.sort()) !== JSON.stringify(newOnline.sort())) {
      broadcast(params.id, 'presence', { online: newOnline })
    }
  }

  return NextResponse.json({ ok: true })
}

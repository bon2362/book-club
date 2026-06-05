export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { assignPseudonym } from '@/lib/matching/pseudonyms'
import { bumpSessionState } from '@/lib/matching/realtime/version'

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
      pseudonym: matchingSessionParticipants.pseudonym,
      joinedAt: matchingSessionParticipants.joinedAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, sessionId))
    .orderBy(matchingSessionParticipants.joinedAt)

  return NextResponse.json({ success: true, data: participants })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId } = params

  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

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

  const [existing] = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(and(
      eq(matchingSessionParticipants.sessionId, sessionId),
      eq(matchingSessionParticipants.userId, userId),
    ))
    .limit(1)

  if (existing) {
    return NextResponse.json({ success: true, pseudonym: existing.pseudonym }, { status: 200 })
  }

  const taken = await db
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const takenSet = new Set(taken.map(r => r.pseudonym))
  const pseudonym = assignPseudonym(takenSet)

  await db.insert(matchingSessionParticipants).values({ sessionId, userId, pseudonym })

  await bumpSessionState(sessionId)

  return NextResponse.json({ success: true, pseudonym }, { status: 201 })
}

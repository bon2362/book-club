export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingPreferenceEvents, matchingSessionParticipants, users } from '@/lib/db/schema'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params = req.nextUrl.searchParams
  const conditions: SQL[] = []

  const sessionId = params.get('sessionId')
  const userId = params.get('userId')
  const actorUserId = params.get('actorUserId')
  const eventType = params.get('eventType')
  const source = params.get('source')
  const bookId = params.get('bookId')

  if (sessionId) conditions.push(eq(matchingPreferenceEvents.sessionId, sessionId))
  if (userId) conditions.push(eq(matchingPreferenceEvents.userId, userId))
  if (actorUserId) conditions.push(eq(matchingPreferenceEvents.actorUserId, actorUserId))
  if (eventType) conditions.push(eq(matchingPreferenceEvents.eventType, eventType))
  if (source) conditions.push(eq(matchingPreferenceEvents.source, source))
  if (bookId) conditions.push(eq(matchingPreferenceEvents.bookId, bookId))

  // Aliases so we can resolve display names for both the affected user and the
  // actor. Names come from `users` (persist even after a participant leaves);
  // pseudonyms come from `matching_session_participants` (null once they leave —
  // for that case the pseudonym is stored in the event metadata at write time).
  const eventUser = alias(users, 'event_user')
  const eventActor = alias(users, 'event_actor')
  const eventUserParticipant = alias(matchingSessionParticipants, 'event_user_participant')
  const eventActorParticipant = alias(matchingSessionParticipants, 'event_actor_participant')

  let query = db
    .select({
      id: matchingPreferenceEvents.id,
      sessionId: matchingPreferenceEvents.sessionId,
      userId: matchingPreferenceEvents.userId,
      actorUserId: matchingPreferenceEvents.actorUserId,
      userName: eventUser.name,
      actorName: eventActor.name,
      userPseudonym: eventUserParticipant.pseudonym,
      actorPseudonym: eventActorParticipant.pseudonym,
      eventType: matchingPreferenceEvents.eventType,
      source: matchingPreferenceEvents.source,
      bookId: matchingPreferenceEvents.bookId,
      before: matchingPreferenceEvents.before,
      after: matchingPreferenceEvents.after,
      metadata: matchingPreferenceEvents.metadata,
      occurredAt: matchingPreferenceEvents.occurredAt,
    })
    .from(matchingPreferenceEvents)
    .leftJoin(eventUser, eq(eventUser.id, matchingPreferenceEvents.userId))
    .leftJoin(eventActor, eq(eventActor.id, matchingPreferenceEvents.actorUserId))
    .leftJoin(
      eventUserParticipant,
      and(
        eq(eventUserParticipant.sessionId, matchingPreferenceEvents.sessionId),
        eq(eventUserParticipant.userId, matchingPreferenceEvents.userId),
      ),
    )
    .leftJoin(
      eventActorParticipant,
      and(
        eq(eventActorParticipant.sessionId, matchingPreferenceEvents.sessionId),
        eq(eventActorParticipant.userId, matchingPreferenceEvents.actorUserId),
      ),
    )
    .$dynamic()

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const events = await query
    .orderBy(desc(matchingPreferenceEvents.occurredAt))
    .limit(parseLimit(params.get('limit')))

  return NextResponse.json({ events })
}

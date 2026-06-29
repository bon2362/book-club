export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingEvents } from '@/lib/db/schema'

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

  if (sessionId) conditions.push(eq(matchingEvents.sessionId, sessionId))
  // userId filter maps to subjectUserId in the new event model
  if (userId) conditions.push(eq(matchingEvents.subjectUserId, userId))
  if (actorUserId) conditions.push(eq(matchingEvents.actorUserId, actorUserId))
  if (eventType) conditions.push(eq(matchingEvents.eventType, eventType))
  if (source) conditions.push(eq(matchingEvents.source, source))
  if (bookId) conditions.push(eq(matchingEvents.bookId, bookId))

  let query = db
    .select({
      id: matchingEvents.id,
      sessionId: matchingEvents.sessionId,
      eventType: matchingEvents.eventType,
      source: matchingEvents.source,
      actorUserId: matchingEvents.actorUserId,
      actorNameSnapshot: matchingEvents.actorNameSnapshot,
      subjectUserId: matchingEvents.subjectUserId,
      subjectNameSnapshot: matchingEvents.subjectNameSnapshot,
      bookId: matchingEvents.bookId,
      before: matchingEvents.before,
      after: matchingEvents.after,
      metadata: matchingEvents.metadata,
      stateVersion: matchingEvents.stateVersion,
      occurredAt: matchingEvents.occurredAt,
    })
    .from(matchingEvents)
    .$dynamic()

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const events = await query
    .orderBy(desc(matchingEvents.occurredAt))
    .limit(parseLimit(params.get('limit')))

  return NextResponse.json({ events })
}

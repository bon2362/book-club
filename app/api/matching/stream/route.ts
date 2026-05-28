export const dynamic = 'force-dynamic'

import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  addSubscriber,
  removeSubscriber,
  canSubscribe,
  heartbeat,
} from '@/lib/matching/realtime/hub'

const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionIdParam = req.nextUrl.searchParams.get('session')
  if (!sessionIdParam) {
    return NextResponse.json({ error: 'session param required' }, { status: 400 })
  }

  const sessionId: string = sessionIdParam

  // Verify session exists
  const [matchSession] = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Verify user is a participant or admin
  const userId = session.user.id
  const isAdmin = session.user.isAdmin

  if (!isAdmin) {
    const [participant] = await db
      .select({ userId: matchingSessionParticipants.userId })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, sessionId),
          eq(matchingSessionParticipants.userId, userId),
        ),
      )
      .limit(1)

    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }
  }

  if (!canSubscribe(sessionId)) {
    return NextResponse.json({ error: 'Too many subscribers' }, { status: 503 })
  }

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  const sub = { controller: null as unknown as ReadableStreamDefaultController, userId }

  const stream = new ReadableStream({
    start(controller) {
      sub.controller = controller
      addSubscriber(sessionId, sub)

      // Heartbeat every 25s
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(heartbeat())
        } catch {
          cleanup()
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Auto-close after 5 minutes
      closeTimer = setTimeout(() => {
        cleanup()
        controller.close()
      }, MAX_STREAM_DURATION_MS)
    },
    cancel() {
      cleanup()
    },
  })

  function cleanup() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
    removeSubscriber(sessionId, sub)
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

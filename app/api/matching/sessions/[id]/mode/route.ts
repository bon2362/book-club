export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities, matchingSessionParticipants, matchingSessions, signupBooks } from '@/lib/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { bumpSessionState } from '@/lib/matching/realtime/version'
import { withAuditContext } from '@/lib/audit/with-audit-context'

type Params = { params: { id: string } }
type OptimizationMode = 'coverage' | 'satisfaction'
const incompletePrioritiesError = 'Нельзя переключить режим: не у всех участников расставлены приоритеты активных книг'

function parseOptimizationMode(body: unknown): OptimizationMode | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as { optimizationMode?: unknown }).optimizationMode
  return value === 'coverage' || value === 'satisfaction' ? value : null
}

function priorityKey(userId: string, bookId: string) {
  return `${userId}\u0000${bookId}`
}

function participantsHaveRankedActiveBooks(
  participantUserIds: string[],
  activeSignups: { userId: string; bookId: string }[],
  ranks: { userId: string; bookId: string; rank: number | null }[],
) {
  const activeByUser = new Map<string, number>()
  for (const signup of activeSignups) {
    activeByUser.set(signup.userId, (activeByUser.get(signup.userId) ?? 0) + 1)
  }

  const ranked = new Set(
    ranks
      .filter((rank) => rank.rank !== null)
      .map((rank) => priorityKey(rank.userId, rank.bookId)),
  )

  return participantUserIds.every((userId) => {
    if ((activeByUser.get(userId) ?? 0) === 0) return false
    return activeSignups
      .filter((signup) => signup.userId === userId)
      .every((signup) => ranked.has(priorityKey(signup.userId, signup.bookId)))
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actorId = session.user.id

  const body = await req.json().catch(() => ({}))
  const optimizationMode = parseOptimizationMode(body)
  if (!optimizationMode) {
    return NextResponse.json({ error: "optimizationMode must be 'coverage' or 'satisfaction'" }, { status: 400 })
  }

  const [matchSession] = await db
    .select({
      id: matchingSessions.id,
      status: matchingSessions.status,
      optimizationMode: matchingSessions.optimizationMode,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (matchSession.status !== 'active') return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
  if (matchSession.optimizationMode === optimizationMode) {
    return NextResponse.json({ ok: true, optimizationMode }, { status: 200 })
  }

  const participants = await db
    .select({ userId: matchingSessionParticipants.userId })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, params.id))

  const participantUserIds = participants.map((participant) => participant.userId)
  if (participantUserIds.length === 0) {
    return NextResponse.json({ error: incompletePrioritiesError }, { status: 409 })
  }

  const [activeSignups, ranks] = await Promise.all([
    db
      .select({ userId: signupBooks.userId, bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(and(
        inArray(signupBooks.userId, participantUserIds),
        isNull(signupBooks.personalStatus),
      )),
    db
      .select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
  ])

  if (!participantsHaveRankedActiveBooks(participantUserIds, activeSignups, ranks)) {
    return NextResponse.json({ error: incompletePrioritiesError }, { status: 409 })
  }

  await withAuditContext(
    { actorUserId: actorId, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'admin' },
    async (tx) => {
      await tx
        .update(matchingSessions)
        .set({ optimizationMode })
        .where(eq(matchingSessions.id, params.id))
    },
  )

  await bumpSessionState(params.id)

  return NextResponse.json({ ok: true, optimizationMode }, { status: 200 })
}

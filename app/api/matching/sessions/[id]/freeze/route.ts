export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  matchingSessions,
  matchingSessionParticipants,
  signupBooks,
  bookPriorities,
  books,
} from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { filterSignupsByMode, generateScenarioSets, type OptimizationMode } from '@/lib/matching/scenarios'
import { bumpSessionState } from '@/lib/matching/realtime/version'
import { withAuditContext } from '@/lib/audit/with-audit-context'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actorId = session.user.id

  const [matchSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (matchSession.status === 'frozen') return NextResponse.json({ error: 'Already frozen' }, { status: 409 })
  const mode = (matchSession.optimizationMode ?? 'coverage') as OptimizationMode

  // Fetch participants and data for scenario generation
  const participants = await db
    .select({ userId: matchingSessionParticipants.userId })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, params.id))

  const participantUserIds = participants.map(p => p.userId)
  if (participantUserIds.length === 0) {
    return NextResponse.json({ error: 'No participants' }, { status: 422 })
  }

  const [allSignups, allRanks, allBooks] = await Promise.all([
    db.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks)
      .where(inArray(signupBooks.userId, participantUserIds)),
    db.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
    db.select({ id: books.id, readingStatus: books.readingStatus })
      .from(books)
      .where(and(eq(books.visibility, 'published'))),
  ])

  const activeSignups = allSignups.filter((signup) => signup.personalStatus === null)
  const signedUpBookIds = new Set(activeSignups.map(s => s.bookId))
  const sessionBooks = allBooks
    .filter(b => signedUpBookIds.has(b.id))
    .map(b => ({ bookId: b.id, readingStatus: b.readingStatus ?? null }))
  const ranks = allRanks.map((rank) => ({ userId: rank.userId, bookId: rank.bookId, rank: rank.rank }))
  const signups = filterSignupsByMode(
    activeSignups.map((signup) => ({ userId: signup.userId, bookId: signup.bookId })),
    ranks,
    mode,
  )

  const scenarioSetOverview = generateScenarioSets({
    participants: participantUserIds.map(uid => ({ userId: uid, pseudonym: uid })),
    books: sessionBooks,
    signups,
    ranks,
    minGroupSize: matchSession.minGroupSize,
    maxGroupSize: matchSession.maxGroupSize,
    mode,
    ...(mode === 'coverage' ? { maxResults: 10 } : {}),
  })

  const leader = scenarioSetOverview.leader

  // Compute metrics
  const frozenAt = new Date()
  const metricGroupsCount = leader?.circles.length ?? 0
  const metricCoverage = leader?.score.coveredCount ?? 0
  const metricTimeToFreezeSeconds = Math.floor(
    (frozenAt.getTime() - matchSession.createdAt.getTime()) / 1000,
  )
  const metricTop3HitRate = leader
    ? leader.circles.reduce((sum, circle) => sum + circle.wantsCount, 0) / Math.max(leader.score.coveredCount, 1)
    : 0

  await withAuditContext(
    { actorUserId: actorId, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'admin' },
    async (tx) => {
      await tx
        .update(matchingSessions)
        .set({
          status: 'frozen',
          frozenAt,
          frozenScenarioJson: leader ?? null,
          metricGroupsCount,
          metricCoverage,
          metricTimeToFreezeSeconds,
          metricTimeSinceLastMutationSeconds: null,
          metricTop3HitRate,
        })
        .where(eq(matchingSessions.id, params.id))
    },
  )

  await bumpSessionState(params.id)

  return NextResponse.json({ ok: true, frozen_at: frozenAt.toISOString(), leader }, { status: 200 })
}

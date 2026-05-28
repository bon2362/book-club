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
import { generateScenarios } from '@/lib/matching/scenarios'
import { broadcast } from '@/lib/matching/realtime/hub'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [matchSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (matchSession.status === 'frozen') return NextResponse.json({ error: 'Already frozen' }, { status: 409 })

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
    db.select({ userId: signupBooks.userId, bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(inArray(signupBooks.userId, participantUserIds)),
    db.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
    db.select({ id: books.id, readingStatus: books.readingStatus })
      .from(books)
      .where(and(eq(books.visibility, 'published'))),
  ])

  const signedUpBookIds = new Set(allSignups.map(s => s.bookId))
  const sessionBooks = allBooks
    .filter(b => signedUpBookIds.has(b.id))
    .map(b => ({ bookId: b.id, readingStatus: b.readingStatus ?? null }))

  const scenarios = generateScenarios({
    participants: participantUserIds.map(uid => ({ userId: uid, pseudonym: uid })),
    books: sessionBooks,
    signups: allSignups,
    ranks: allRanks,
    targetGroupSize: matchSession.targetGroupSize,
    maxResults: 10,
  })

  const leader = scenarios[0] ?? null

  // Compute metrics
  const frozenAt = new Date()
  const metricGroupsCount = scenarios.length
  const metricCoverage = scenarios.reduce((sum, s) => sum + s.members.length, 0)
  const metricTimeToFreezeSeconds = Math.floor(
    (frozenAt.getTime() - matchSession.createdAt.getTime()) / 1000,
  )
  const metricTop3HitRate = leader
    ? leader.wantsCount / matchSession.targetGroupSize
    : 0

  await db
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

  broadcast(params.id, 'session_frozen', { frozen_at: frozenAt.toISOString(), frozen_scenario: leader })

  return NextResponse.json({ ok: true, frozen_at: frozenAt.toISOString(), leader }, { status: 200 })
}

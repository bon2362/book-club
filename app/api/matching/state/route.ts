export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, signupBooks, bookPriorities, books } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { fetchMyMoves } from '@/lib/matching/my-moves'
import {
  emptyScenarioOverview,
  emptyScenarioSetOverview,
  filterSignupsByMode,
  generateScenarioOverview,
  generateScenarioSets,
  type OptimizationMode,
  type ScenarioOverview,
  type ScenarioSetOverview,
} from '@/lib/matching/scenarios'
import {
  publicizeMyMoves,
  publicizeScenarioOverview,
  publicizeScenarioSetOverview,
} from '@/lib/matching/public-state'
import { userHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = req.nextUrl.searchParams.get('session')
  if (!sessionId) return NextResponse.json({ error: 'session param required' }, { status: 400 })

  const [matchSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const mode = (matchSession.optimizationMode ?? 'coverage') as OptimizationMode

  const participants = await db
    .select({
      userId: matchingSessionParticipants.userId,
      pseudonym: matchingSessionParticipants.pseudonym,
    })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const participantUserIds = participants.map(p => p.userId)
  const isAdmin = session.user.isAdmin ?? false
  const currentParticipant = participants.find((participant) => participant.userId === session.user.id)

  if (!isAdmin && !currentParticipant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  // Support ?as= for admin impersonation (Epic 4) — userId used for personal data
  const asParam = req.nextUrl.searchParams.get('as')
  const effectiveUserId = (isAdmin && asParam) ? asParam : session.user.id

  const [personalBooks, myMoves] = await Promise.all([
    fetchCatalogWithPersonalData(effectiveUserId),
    fetchMyMoves(effectiveUserId, sessionId, matchSession.minGroupSize),
  ])

  // Scenario generation
  let scenarioOverview: ScenarioOverview = emptyScenarioOverview(
    participants,
    matchSession.minGroupSize,
    matchSession.maxGroupSize,
    mode,
  )
  let scenarioSetOverview: ScenarioSetOverview = emptyScenarioSetOverview(
    participants,
    matchSession.minGroupSize,
    matchSession.maxGroupSize,
    mode,
  )
  if (participantUserIds.length >= matchSession.minGroupSize) {
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
    const signedUpBookIds = new Set(allSignups.map(s => s.bookId))
    const sessionBooks = allBooks.filter(b => signedUpBookIds.has(b.id)).map(b => ({ bookId: b.id, readingStatus: b.readingStatus ?? null }))
    const activeSignups = allSignups.filter(s => s.personalStatus === null)
    const ranks = allRanks.map((rank) => ({ userId: rank.userId, bookId: rank.bookId, rank: rank.rank }))
    const signups = filterSignupsByMode(
      activeSignups.map(s => ({ userId: s.userId, bookId: s.bookId })),
      ranks,
      mode,
    )
    const viewerHasCompleteRanking = userHasCompleteActiveRanking(effectiveUserId, activeSignups, ranks)
    const shouldGenerateScenarios = mode !== 'satisfaction' || (isAdmin && asParam) || viewerHasCompleteRanking
    if (shouldGenerateScenarios) {
      const scenarioInput = {
        participants,
        books: sessionBooks,
        signups,
        ranks,
        minGroupSize: matchSession.minGroupSize,
        maxGroupSize: matchSession.maxGroupSize,
        mode,
        ...(mode === 'coverage' ? { maxResults: 10 } : {}),
      }
      scenarioSetOverview = generateScenarioSets(scenarioInput)
      scenarioOverview = generateScenarioOverview(scenarioInput)
    }
  }

  const publicUserIdByInternalId = new Map(participants.map((participant) => [
    participant.userId,
    isAdmin ? participant.userId : participant.pseudonym,
  ]))

  return NextResponse.json({
    personalBooks,
    myMoves: isAdmin ? myMoves : publicizeMyMoves(myMoves, publicUserIdByInternalId),
    scenarios: isAdmin ? scenarioOverview.current : publicizeScenarioOverview(scenarioOverview, publicUserIdByInternalId).current,
    scenarioOverview: isAdmin ? scenarioOverview : publicizeScenarioOverview(scenarioOverview, publicUserIdByInternalId),
    scenarioSetOverview: isAdmin ? scenarioSetOverview : publicizeScenarioSetOverview(scenarioSetOverview, publicUserIdByInternalId),
    sessionStatus: matchSession.status,
  })
}

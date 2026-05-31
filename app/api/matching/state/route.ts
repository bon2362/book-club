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
  generateScenarioOverview,
  generateScenarioSets,
  type ScenarioOverview,
  type ScenarioSetOverview,
} from '@/lib/matching/scenarios'

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

  // Support ?as= for admin impersonation (Epic 4) — userId used for personal data
  const asParam = req.nextUrl.searchParams.get('as')
  const isAdmin = session.user.isAdmin
  const effectiveUserId = (isAdmin && asParam) ? asParam : session.user.id

  const participants = await db
    .select({
      userId: matchingSessionParticipants.userId,
      pseudonym: matchingSessionParticipants.pseudonym,
    })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const participantUserIds = participants.map(p => p.userId)

  const [personalBooks, myMoves] = await Promise.all([
    fetchCatalogWithPersonalData(effectiveUserId),
    fetchMyMoves(effectiveUserId, sessionId, matchSession.targetGroupSize),
  ])

  // Scenario generation
  let scenarioOverview: ScenarioOverview = emptyScenarioOverview(participants, matchSession.targetGroupSize)
  let scenarioSetOverview: ScenarioSetOverview = emptyScenarioSetOverview(participants, matchSession.targetGroupSize)
  if (participantUserIds.length >= matchSession.targetGroupSize) {
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
    const scenarioInput = {
      participants,
      books: sessionBooks,
      signups: activeSignups.map(s => ({ userId: s.userId, bookId: s.bookId })),
      ranks: allRanks,
      targetGroupSize: matchSession.targetGroupSize,
      maxResults: 10,
    }
    scenarioSetOverview = generateScenarioSets(scenarioInput)
    scenarioOverview = generateScenarioOverview(scenarioInput)
  }

  return NextResponse.json({
    personalBooks,
    myMoves,
    scenarios: scenarioOverview.current,
    scenarioOverview,
    scenarioSetOverview,
    sessionStatus: matchSession.status,
  })
}

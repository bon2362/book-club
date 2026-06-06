import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
} from '@/lib/db/schema'
import {
  emptyScenarioSetOverview,
  filterSignupsByMode,
  generateScenarioSets,
  type GenerateScenariosInput,
  type OptimizationMode,
  type ScenarioSetOverview,
} from './scenarios'

export interface MatchingScenarioContext {
  participants: { userId: string; pseudonym: string }[]
  overview: ScenarioSetOverview
  bookTitleById: Map<string, string>
}

export async function fetchScenarioInputForSession(
  sessionId: string,
  minGroupSize: number,
  maxGroupSize: number,
  mode: OptimizationMode = 'coverage',
): Promise<GenerateScenariosInput> {
  const participants = await db
    .select({
      userId: matchingSessionParticipants.userId,
      pseudonym: matchingSessionParticipants.pseudonym,
    })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const participantUserIds = participants.map((p) => p.userId)
  if (participantUserIds.length === 0) {
    return { participants, books: [], signups: [], ranks: [], minGroupSize, maxGroupSize, mode, ...(mode === 'coverage' ? { maxResults: 10 } : {}) }
  }

  const [allSignups, allRanks, allBooks] = await Promise.all([
    db
      .select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks)
      .where(inArray(signupBooks.userId, participantUserIds)),
    db
      .select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
    db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.visibility, 'published')),
  ])

  const signedUpBookIds = new Set(allSignups.map((signup) => signup.bookId))
  const activeSignups = allSignups.filter((signup) => signup.personalStatus === null)
  const ranks = allRanks.map((rank) => ({ userId: rank.userId, bookId: rank.bookId, rank: rank.rank }))
  const signups = filterSignupsByMode(
    activeSignups.map((signup) => ({ userId: signup.userId, bookId: signup.bookId })),
    ranks,
    mode,
  )

  return {
    participants,
    books: allBooks.filter((book) => signedUpBookIds.has(book.id)).map((book) => ({ bookId: book.id })),
    signups,
    ranks,
    minGroupSize,
    maxGroupSize,
    mode,
    ...(mode === 'coverage' ? { maxResults: 10 } : {}),
  }
}

export async function fetchScenarioContextForSession(sessionId: string): Promise<MatchingScenarioContext | null> {
  const [matchingSession] = await db
    .select({
      id: matchingSessions.id,
      minGroupSize: matchingSessions.minGroupSize,
      maxGroupSize: matchingSessions.maxGroupSize,
      optimizationMode: matchingSessions.optimizationMode,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchingSession) return null

  const input = await fetchScenarioInputForSession(
    sessionId,
    matchingSession.minGroupSize,
    matchingSession.maxGroupSize,
    (matchingSession.optimizationMode ?? 'coverage') as OptimizationMode,
  )
  const mode = input.mode ?? 'coverage'
  const overview = input.participants.length >= matchingSession.minGroupSize
    ? generateScenarioSets(input)
    : emptyScenarioSetOverview(input.participants, matchingSession.minGroupSize, matchingSession.maxGroupSize, mode)

  const bookRows = await db
    .select({ id: books.id, title: books.title })
    .from(books)
    .where(and(eq(books.visibility, 'published')))

  return {
    participants: input.participants,
    overview,
    bookTitleById: new Map(bookRows.map((book) => [book.id, book.title])),
  }
}

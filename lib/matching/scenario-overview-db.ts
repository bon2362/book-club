import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingLockedCircleMembers,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import {
  emptyScenarioSetOverview,
  filterRankedSignups,
  generateSatisfactionScenarioSets,
  type ScenarioSetOverview,
} from './scenarios'

type DbClient = typeof db

export async function fetchMatchingScenarioOverview(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<ScenarioSetOverview> {
  const [session] = await dbClient.select({
    minGroupSize: matchingSessions.minGroupSize,
    maxGroupSize: matchingSessions.maxGroupSize,
  }).from(matchingSessions).where(eq(matchingSessions.id, sessionId)).limit(1)
  if (!session) return emptyScenarioSetOverview([], 0, 0)

  const [participantRows, lockedRows] = await Promise.all([
    dbClient.select({
      userId: matchingSessionParticipants.userId,
      publicRef: matchingSessionParticipants.publicRef,
      joinedAt: matchingSessionParticipants.joinedAt,
      name: users.name,
    }).from(matchingSessionParticipants)
      .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
      .where(eq(matchingSessionParticipants.sessionId, sessionId)),
    dbClient.select({ userId: matchingLockedCircleMembers.userId })
      .from(matchingLockedCircleMembers)
      .where(and(
        eq(matchingLockedCircleMembers.sessionId, sessionId),
        isNull(matchingLockedCircleMembers.releasedAt),
      )),
  ])
  const lockedUserIds = new Set(lockedRows.map((row) => row.userId))
  const activeParticipants = participantRows.filter((row) => !lockedUserIds.has(row.userId))
  if (activeParticipants.length < session.minGroupSize) {
    return emptyScenarioSetOverview(
      activeParticipants.map(({ userId }) => ({ userId, displayName: userId })),
      session.minGroupSize,
      session.maxGroupSize,
    )
  }

  const activeUserIds = activeParticipants.map(({ userId }) => userId)
  const [allSignups, allRanks, allBooks] = await Promise.all([
    dbClient.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks).where(inArray(signupBooks.userId, activeUserIds)),
    dbClient.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities).where(inArray(bookPriorities.userId, activeUserIds)),
    dbClient.select({ id: books.id }).from(books).where(eq(books.visibility, 'published')),
  ])
  const ranks = allRanks.map(({ userId, bookId, rank }) => ({ userId, bookId, rank }))
  const signups = filterRankedSignups(
    allSignups.filter(({ personalStatus }) => personalStatus === null).map(({ userId, bookId }) => ({ userId, bookId })),
    ranks,
  )
  const signedUpBookIds = new Set(signups.map(({ bookId }) => bookId))
  const displayNames = assignMatchingDisplayNames(activeParticipants)
  return generateSatisfactionScenarioSets({
    participants: activeParticipants.map(({ userId }) => ({
      userId,
      displayName: displayNames.get(userId) ?? 'Без имени',
    })),
    books: allBooks.filter(({ id }) => signedUpBookIds.has(id)).map(({ id }) => ({ bookId: id })),
    signups,
    ranks,
    minGroupSize: session.minGroupSize,
    maxGroupSize: session.maxGroupSize,
  })
}

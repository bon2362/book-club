import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities, books, matchingLockedCircleMembers, matchingSessionParticipants,
  matchingSessions, signupBooks, users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import { filterRankedSignups, type GenerateScenariosInput } from './scenarios'

type DbClient = typeof db

export async function fetchMatchingScenarioInput(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<GenerateScenariosInput | null> {
  const [session] = await dbClient.select({
    minGroupSize: matchingSessions.minGroupSize,
    maxGroupSize: matchingSessions.maxGroupSize,
  }).from(matchingSessions).where(eq(matchingSessions.id, sessionId)).limit(1)
  if (!session) return null

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
  const lockedUserIds = new Set(lockedRows.map(({ userId }) => userId))
  const activeParticipants = participantRows.filter(({ userId }) => !lockedUserIds.has(userId))
  const activeUserIds = activeParticipants.map(({ userId }) => userId)
  const displayNames = assignMatchingDisplayNames(activeParticipants)
  const base = {
    participants: activeParticipants.map(({ userId }) => ({
      userId, displayName: displayNames.get(userId) ?? 'Без имени',
    })),
    minGroupSize: session.minGroupSize,
    maxGroupSize: session.maxGroupSize,
  }
  if (activeUserIds.length < session.minGroupSize) {
    return { ...base, books: [], signups: [], ranks: [] }
  }

  const [allSignups, ranks, allBooks] = await Promise.all([
    dbClient.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks).where(inArray(signupBooks.userId, activeUserIds)),
    dbClient.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities).where(inArray(bookPriorities.userId, activeUserIds)),
    dbClient.select({ id: books.id }).from(books).where(eq(books.visibility, 'published')),
  ])
  const signups = filterRankedSignups(
    allSignups.filter(({ personalStatus }) => personalStatus === null).map(({ userId, bookId }) => ({ userId, bookId })),
    ranks,
  )
  const signedUpBookIds = new Set(signups.map(({ bookId }) => bookId))
  return {
    ...base,
    books: allBooks.filter(({ id }) => signedUpBookIds.has(id)).map(({ id }) => ({ bookId: id })),
    signups,
    ranks,
  }
}

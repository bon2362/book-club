import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities, books, matchingLockedCircleMembers, matchingSessionParticipants,
  matchingSessions, signupBooks, users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import { filterRankedSignups, type GenerateScenariosInput } from './scenarios'

type DbClient = typeof db

interface ScenarioInputRows {
  session: { minGroupSize: number; maxGroupSize: number }
  participants: Array<{ userId: string; publicRef: string; joinedAt: Date; name: string | null }>
  lockedUserIds: string[]
  signups: Array<{ userId: string; bookId: string; personalStatus: string | null }>
  ranks: Array<{ userId: string; bookId: string; rank: number | null }>
  books: Array<{ id: string }>
}

export function buildScenarioInput(rows: ScenarioInputRows): GenerateScenariosInput {
  const lockedUserIds = new Set(rows.lockedUserIds)
  const activeParticipants = rows.participants.filter(({ userId }) => !lockedUserIds.has(userId))
  const activeUserIds = new Set(activeParticipants.map(({ userId }) => userId))
  const displayNames = assignMatchingDisplayNames(activeParticipants)
  const ranks = rows.ranks.filter(({ userId }) => activeUserIds.has(userId))
  const signups = filterRankedSignups(
    rows.signups
      .filter(({ userId, personalStatus }) => activeUserIds.has(userId) && personalStatus === null)
      .map(({ userId, bookId }) => ({ userId, bookId })),
    ranks,
  )
  const signedUpBookIds = new Set(signups.map(({ bookId }) => bookId))
  return {
    participants: activeParticipants.map(({ userId }) => ({
      userId,
      displayName: displayNames.get(userId) ?? 'Без имени',
    })),
    books: rows.books.filter(({ id }) => signedUpBookIds.has(id)).map(({ id }) => ({ bookId: id })),
    signups,
    ranks,
    minGroupSize: rows.session.minGroupSize,
    maxGroupSize: rows.session.maxGroupSize,
  }
}

export async function fetchMatchingScenarioInputForSnapshot(
  snapshot: Pick<ScenarioInputRows, 'session' | 'participants' | 'lockedUserIds'>,
  dbClient: DbClient = db,
): Promise<GenerateScenariosInput> {
  const activeUserIds = snapshot.participants
    .filter(({ userId }) => !snapshot.lockedUserIds.includes(userId))
    .map(({ userId }) => userId)
  if (activeUserIds.length < snapshot.session.minGroupSize) {
    return buildScenarioInput({ ...snapshot, signups: [], ranks: [], books: [] })
  }
  const [signups, ranks, allBooks] = await Promise.all([
    dbClient.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks).where(inArray(signupBooks.userId, activeUserIds)),
    dbClient.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities).where(inArray(bookPriorities.userId, activeUserIds)),
    dbClient.select({ id: books.id }).from(books).where(eq(books.visibility, 'published')),
  ])
  return buildScenarioInput({ ...snapshot, signups, ranks, books: allBooks })
}

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
  return fetchMatchingScenarioInputForSnapshot({
    session,
    participants: participantRows,
    lockedUserIds: lockedRows.map(({ userId }) => userId),
  }, dbClient)
}

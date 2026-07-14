import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  matchingCircleConfirmations,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingLockedCircleMembers,
  matchingLockedCircles,
  matchingNotices,
  matchingSessionParticipants,
  matchingSessions,
  matchingSessionBookStates,
  bookPriorities,
  signupBooks,
  books,
  users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import { isOnline } from './presence'
import { assemblePublicSessionState } from './public-state'
import { fetchMatchingScenarioOverview } from './scenario-overview-db'
import { buildPublicBookModeState } from './book-public-state'

type DbClient = typeof db

export class PublicMatchingStateError extends Error {
  constructor(public readonly code: 'session_not_found' | 'participant_missing') {
    super(code)
    this.name = 'PublicMatchingStateError'
  }
}

export async function fetchMatchingPublicState(
  sessionId: string,
  viewerUserId: string,
  dbClient: DbClient = db,
  options: { admin?: boolean } = {},
) {
  const [session] = await dbClient
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      stateVersion: matchingSessions.stateVersion,
      minGroupSize: matchingSessions.minGroupSize,
      maxGroupSize: matchingSessions.maxGroupSize,
      deadlineAt: matchingSessions.deadlineAt,
      frozenSnapshot: matchingSessions.frozenScenarioJson,
      bookModeInitializedAt: matchingSessions.bookModeInitializedAt,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)
  if (!session) throw new PublicMatchingStateError('session_not_found')

  const participantRows = await dbClient
    .select({
      userId: matchingSessionParticipants.userId,
      publicRef: matchingSessionParticipants.publicRef,
      joinedAt: matchingSessionParticipants.joinedAt,
      lastSeenAt: matchingSessionParticipants.lastSeenAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, sessionId))
  const viewerIsParticipant = participantRows.some((participant) => participant.userId === viewerUserId)
  if (!viewerIsParticipant && !options.admin) {
    throw new PublicMatchingStateError('participant_missing')
  }

  const displayNames = assignMatchingDisplayNames(participantRows)
  const participants = participantRows.map((participant) => ({
    userId: participant.userId,
    publicRef: participant.publicRef,
    displayName: displayNames.get(participant.userId) ?? 'Без имени',
    online: isOnline(participant.lastSeenAt),
  }))

  const [confirmations, lockedCircleRows, notices] = await Promise.all([
    dbClient
      .select({
        userId: matchingCircleConfirmations.userId,
        bookId: matchingCircleConfirmations.bookId,
        circleKey: matchingCircleConfirmations.circleKey,
        memberUserIds: matchingCircleConfirmations.memberUserIdsJson,
      })
      .from(matchingCircleConfirmations)
      .where(eq(matchingCircleConfirmations.sessionId, sessionId)),
    dbClient
      .select({
        id: matchingLockedCircles.id,
        circleKey: matchingLockedCircles.circleKey,
        bookId: matchingLockedCircles.bookId,
        lockedAt: matchingLockedCircles.lockedAt,
      })
      .from(matchingLockedCircles)
      .where(and(
        eq(matchingLockedCircles.sessionId, sessionId),
        eq(matchingLockedCircles.status, 'locked'),
      ))
      .orderBy(asc(matchingLockedCircles.lockedAt)),
    dbClient
      .select({
        id: matchingNotices.id,
        kind: matchingNotices.kind,
        payload: matchingNotices.payload,
        createdAt: matchingNotices.createdAt,
      })
      .from(matchingNotices)
      .where(and(
        eq(matchingNotices.sessionId, sessionId),
        eq(matchingNotices.userId, viewerUserId),
        isNull(matchingNotices.readAt),
      ))
      .orderBy(asc(matchingNotices.createdAt)),
  ])

  const circleIds = lockedCircleRows.map((circle) => circle.id)
  const memberRows = circleIds.length > 0
    ? await dbClient
      .select({
        circleId: matchingLockedCircleMembers.circleId,
        userId: matchingLockedCircleMembers.userId,
        displayNameSnapshot: matchingLockedCircleMembers.displayNameSnapshot,
      })
      .from(matchingLockedCircleMembers)
      .where(and(
        inArray(matchingLockedCircleMembers.circleId, circleIds),
        isNull(matchingLockedCircleMembers.releasedAt),
      ))
    : []
  const lockedCircles = lockedCircleRows.map((circle) => ({
    ...circle,
    members: memberRows
      .filter((member) => member.circleId === circle.id)
      .map(({ userId, displayNameSnapshot }) => ({ userId, displayNameSnapshot })),
  }))
  const scenarioOverview = await fetchMatchingScenarioOverview(sessionId, dbClient, {
    session,
    participants: participantRows,
    lockedUserIds: memberRows.map(({ userId }) => userId),
  })

  const effectiveViewerUserId = viewerIsParticipant ? viewerUserId : participantRows[0]?.userId
  const assembledLegacyState = effectiveViewerUserId
    ? assemblePublicSessionState({
      session,
      viewerUserId: effectiveViewerUserId,
      participants,
      scenarioOverview,
      confirmations,
      lockedCircles,
      notices,
    })
    : {
      session: {
        name: session.name,
        status: session.status,
        stateVersion: session.stateVersion,
        minGroupSize: session.minGroupSize,
        maxGroupSize: session.maxGroupSize,
        deadlineAt: session.deadlineAt?.toISOString() ?? null,
        frozenSnapshot: null,
      },
      viewer: { role: 'active' as const, ref: 'admin', lockedCircleKey: null },
      participants: [],
      scenarios: [],
      lockedCircles: [],
      notices: [],
    }
  const legacyState = options.admin && !viewerIsParticipant
    ? { ...assembledLegacyState, viewer: { role: 'active' as const, ref: 'admin-viewer', lockedCircleKey: null } }
    : assembledLegacyState

  if (!session.bookModeInitializedAt) return { ...legacyState, bookMode: null }

  const [interests, intents, assignments, formedRows, circleRows] = await Promise.all([
    dbClient.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, rank: bookPriorities.rank })
      .from(signupBooks)
      .innerJoin(matchingSessionParticipants, and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, signupBooks.userId),
      ))
      .leftJoin(bookPriorities, and(
        eq(bookPriorities.userId, signupBooks.userId),
        eq(bookPriorities.bookId, signupBooks.bookId),
      ))
      .where(isNull(signupBooks.personalStatus)),
    dbClient.select({
      userId: matchingBookIntents.userId,
      bookId: matchingBookIntents.bookId,
      kind: matchingBookIntents.kind,
    }).from(matchingBookIntents).where(eq(matchingBookIntents.sessionId, sessionId)),
    dbClient.select({
      userId: matchingBookAssignments.userId,
      bookId: matchingBookAssignments.bookId,
      circleId: matchingBookAssignments.circleId,
    }).from(matchingBookAssignments).where(eq(matchingBookAssignments.sessionId, sessionId)),
    dbClient.select({
      bookId: matchingSessionBookStates.bookId,
      formedAt: matchingSessionBookStates.formedAt,
    }).from(matchingSessionBookStates).where(eq(matchingSessionBookStates.sessionId, sessionId)),
    dbClient.select({
      id: matchingCircles.id,
      bookId: matchingCircles.bookId,
      position: matchingCircles.position,
    }).from(matchingCircles).where(eq(matchingCircles.sessionId, sessionId)),
  ])
  const bookIds = Array.from(new Set([
    ...interests.map(item => item.bookId),
    ...intents.map(item => item.bookId),
    ...assignments.map(item => item.bookId),
    ...formedRows.map(item => item.bookId),
    ...circleRows.map(item => item.bookId),
  ]))
  const bookRows = bookIds.length > 0
    ? await dbClient.select({
      bookId: books.id,
      bookSlug: books.slug,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      sortOrder: books.sortOrder,
      description: books.description,
      pages: books.pages,
      publishedDate: books.publishedDate,
      textUrl: books.textUrl,
      whyRead: books.whyRead,
      recommendationLink: books.recommendationLink,
      tags: books.tags,
    }).from(books).where(inArray(books.id, bookIds))
    : []
  const bookMode = buildPublicBookModeState({
    initializedAt: session.bookModeInitializedAt,
    sessionStatus: session.status,
    viewerUserId,
    admin: options.admin ?? false,
    books: bookRows,
    participants: participants.map(participant => ({
      userId: participant.userId,
      publicRef: participant.publicRef,
      displayName: participant.displayName,
    })),
    interests,
    intents,
    assignments,
    formedAtByBookId: new Map(formedRows.map(item => [item.bookId, item.formedAt])),
    circles: circleRows,
  })
  return {
    ...legacyState,
    viewer: {
      ...legacyState.viewer,
      role: bookMode.viewerAssignmentBookId ? 'observer' as const : 'active' as const,
      lockedCircleKey: null,
    },
    bookMode,
  }
}

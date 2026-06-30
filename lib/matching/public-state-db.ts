import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  matchingCircleConfirmations,
  matchingLockedCircleMembers,
  matchingLockedCircles,
  matchingNotices,
  matchingSessionParticipants,
  matchingSessions,
  users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import { isOnline } from './presence'
import { assemblePublicSessionState } from './public-state'
import { fetchMatchingScenarioOverview } from './scenario-overview-db'

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
  if (!participantRows.some((participant) => participant.userId === viewerUserId)) {
    throw new PublicMatchingStateError('participant_missing')
  }

  const displayNames = assignMatchingDisplayNames(participantRows)
  const participants = participantRows.map((participant) => ({
    userId: participant.userId,
    publicRef: participant.publicRef,
    displayName: displayNames.get(participant.userId) ?? 'Без имени',
    online: isOnline(participant.lastSeenAt),
  }))

  const [scenarioOverview, confirmations, lockedCircleRows, notices] = await Promise.all([
    fetchMatchingScenarioOverview(sessionId, dbClient),
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

  return assemblePublicSessionState({
    session,
    viewerUserId,
    participants,
    scenarioOverview,
    confirmations,
    lockedCircles,
    notices,
  })
}

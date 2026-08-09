import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingNotices,
  matchingSessionBookStates,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { assignMatchingDisplayNames } from './display-names'
import { isOnline } from './presence'
import { buildPublicBookModeState } from './book-public-state'
import { normalizeMatchingSessionStatus } from './session-status'

type DbClient = typeof db

export class PublicMatchingStateError extends Error {
  constructor(public readonly code: 'session_not_found' | 'participant_missing') {
    super(code)
    this.name = 'PublicMatchingStateError'
  }
}

function snapshotNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : []
}

function executeRows<T>(result: unknown): T[] {
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows
  }
  return result as T[]
}

async function isMultibookReady(dbClient: DbClient): Promise<boolean> {
  const result = await dbClient.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'matching_book_assignments'::regclass
        AND conname = 'matching_book_assignments_session_user_book_pk'
    ) AS ready
  `)
  return Boolean(executeRows<{ ready: boolean }>(result)[0]?.ready)
}

function publicNoticePayload(notice: { kind: string; payload: Record<string, unknown> }): Record<string, unknown> {
  if (notice.kind === 'confirmation_invalidated') {
    return { members: snapshotNames(notice.payload.memberDisplayNames) }
  }
  if (notice.kind === 'circle_locked') {
    return { circleKey: notice.payload.circleKey, bookId: notice.payload.bookId }
  }
  if (notice.kind === 'circle_dissolved') {
    return {
      bookId: notice.payload.bookId,
      members: snapshotNames(notice.payload.memberDisplayNames),
      reason: notice.payload.reason,
    }
  }
  if (notice.kind === 'conditional_intents_cleared') {
    return { books: snapshotNames(notice.payload.books) }
  }
  return {}
}

export async function fetchMatchingPublicState(
  sessionId: string,
  viewerUserId: string,
  dbClient: DbClient = db,
  options: { admin?: boolean; multibookReady?: boolean } = {},
) {
  const [session] = await dbClient.select({
    id: matchingSessions.id,
    name: matchingSessions.name,
    status: matchingSessions.status,
    stateVersion: matchingSessions.stateVersion,
    deadlineAt: matchingSessions.deadlineAt,
    createdAt: matchingSessions.createdAt,
  }).from(matchingSessions).where(eq(matchingSessions.id, sessionId)).limit(1)
  if (!session) throw new PublicMatchingStateError('session_not_found')
  const multibookReady = options.multibookReady ?? await isMultibookReady(dbClient)

  const participantRows = await dbClient.select({
    userId: matchingSessionParticipants.userId,
    publicRef: matchingSessionParticipants.publicRef,
    joinedAt: matchingSessionParticipants.joinedAt,
    lastSeenAt: matchingSessionParticipants.lastSeenAt,
    name: users.name,
  }).from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, sessionId))
  const viewerIsParticipant = participantRows.some((participant) => participant.userId === viewerUserId)
  if (!viewerIsParticipant && !options.admin) throw new PublicMatchingStateError('participant_missing')

  const displayNames = assignMatchingDisplayNames(participantRows)
  const participants = participantRows.map((participant) => ({
    userId: participant.userId,
    publicRef: participant.publicRef,
    displayName: displayNames.get(participant.userId) ?? 'Без имени',
    online: isOnline(participant.lastSeenAt),
  }))

  const [notices, interests, intents, assignments, formedRows, circleRows] = await Promise.all([
    dbClient.select({
      id: matchingNotices.id,
      kind: matchingNotices.kind,
      payload: matchingNotices.payload,
      createdAt: matchingNotices.createdAt,
    }).from(matchingNotices).where(and(
      eq(matchingNotices.sessionId, sessionId),
      eq(matchingNotices.userId, viewerUserId),
      isNull(matchingNotices.readAt),
    )).orderBy(asc(matchingNotices.createdAt)),
    dbClient.select({ userId: signupBooks.userId, bookId: signupBooks.bookId, rank: bookPriorities.rank })
      .from(signupBooks)
      .innerJoin(matchingSessionParticipants, and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, signupBooks.userId),
      ))
      .leftJoin(bookPriorities, and(
        eq(bookPriorities.userId, signupBooks.userId),
        eq(bookPriorities.bookId, signupBooks.bookId),
      )).where(isNull(signupBooks.personalStatus)),
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
    ...interests.map((item) => item.bookId),
    ...intents.map((item) => item.bookId),
    ...assignments.map((item) => item.bookId),
    ...formedRows.map((item) => item.bookId),
    ...circleRows.map((item) => item.bookId),
  ]))
  const bookRows = bookIds.length > 0 ? await dbClient.select({
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
  }).from(books).where(inArray(books.id, bookIds)) : []

  const sessionStatus = normalizeMatchingSessionStatus(session.status)
  const bookMode = buildPublicBookModeState({
    initializedAt: session.createdAt,
    sessionStatus,
    multibookReady,
    viewerUserId,
    admin: options.admin ?? false,
    books: bookRows,
    participants: participants.map(({ userId, publicRef, displayName }) => ({ userId, publicRef, displayName })),
    interests,
    intents,
    assignments,
    formedAtByBookId: new Map(formedRows.map((item) => [item.bookId, item.formedAt])),
    circles: circleRows,
  })

  const viewer = participants.find((participant) => participant.userId === viewerUserId)
  return {
    session: {
      name: session.name,
      status: sessionStatus,
      stateVersion: session.stateVersion,
      deadlineAt: session.deadlineAt?.toISOString() ?? null,
    },
    viewer: {
      role: bookMode.viewerAssignmentBookIds.length > 0 ? 'observer' as const : 'active' as const,
      ref: viewer?.publicRef ?? 'admin-viewer',
    },
    participants: participants.map((participant) => ({
      ref: participant.publicRef,
      displayName: participant.displayName,
      online: participant.online,
    })),
    notices: notices.map((notice) => ({
      id: notice.id,
      kind: notice.kind,
      payload: publicNoticePayload(notice),
      createdAt: notice.createdAt.toISOString(),
    })),
    bookMode,
  }
}

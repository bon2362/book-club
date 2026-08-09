import { randomUUID } from 'crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingSessionBookStates,
  matchingSessions,
  signupBooks,
} from '@/lib/db/schema'
import { nextRank } from './rank-assignment'
import { partitionBookAssignments, planBookFormation } from './book-partition'
import {
  MatchingTransitionError,
  type MatchingAction,
  type MatchingActionResult,
  type MatchingTransitionActor,
} from './session-transition'

type DbClient = typeof db
type BookAction = Extract<MatchingAction, {
  type:
    | 'set_conditional'
    | 'unset_conditional'
    | 'set_hard'
    | 'cancel_hard'
    | 'admin_assign_book'
    | 'admin_unassign_book'
    | 'admin_create_book_circle'
    | 'admin_delete_book_circle'
    | 'admin_place_book_assignment'
    | 'close_session'
    | 'reopen_session'
}>

type RemovedConditionalBook = { bookId: string; title: string }
type ConditionalCleanup = Map<string, RemovedConditionalBook[]>

async function requireShortlistBook(tx: DbClient, userId: string, bookId: string) {
  const [signup] = await tx
    .select({ personalStatus: signupBooks.personalStatus })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)
  if (!signup || signup.personalStatus !== null) {
    throw new MatchingTransitionError('book_not_in_shortlist')
  }
}

async function ensureShortlistBook(tx: DbClient, userId: string, bookId: string) {
  const [existing] = await tx
    .select({ personalStatus: signupBooks.personalStatus })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)

  if (!existing) {
    await tx.insert(signupBooks).values({ userId, bookId })
  } else if (existing.personalStatus !== null) {
    await tx.update(signupBooks)
      .set({ personalStatus: null, personalStatusUpdatedAt: new Date() })
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
  }

  const ranked = await tx.select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
  await tx.insert(bookPriorities)
    .values({ userId, bookId, rank: nextRank(ranked), rankSource: 'auto' })
    .onConflictDoNothing()
}

async function clearConditionalIntents(
  tx: DbClient,
  sessionId: string,
  userIds: string[],
  ignoredBookByUser: ReadonlyMap<string, string> = new Map(),
): Promise<ConditionalCleanup> {
  if (userIds.length === 0) return new Map()
  const rows = await tx.select({
    userId: matchingBookIntents.userId,
    bookId: matchingBookIntents.bookId,
    title: books.title,
  }).from(matchingBookIntents).innerJoin(books, eq(books.id, matchingBookIntents.bookId)).where(and(
    eq(matchingBookIntents.sessionId, sessionId),
    eq(matchingBookIntents.kind, 'conditional'),
    inArray(matchingBookIntents.userId, userIds),
  ))
  await tx.delete(matchingBookIntents).where(and(
    eq(matchingBookIntents.sessionId, sessionId),
    eq(matchingBookIntents.kind, 'conditional'),
    inArray(matchingBookIntents.userId, userIds),
  ))
  const result: ConditionalCleanup = new Map()
  for (const row of rows) {
    if (ignoredBookByUser.get(row.userId) === row.bookId) continue
    result.set(row.userId, [...(result.get(row.userId) ?? []), { bookId: row.bookId, title: row.title }])
  }
  return result
}

function mergeConditionalCleanup(...cleanups: ConditionalCleanup[]): ConditionalCleanup {
  const result: ConditionalCleanup = new Map()
  for (const cleanup of cleanups) {
    for (const [userId, removed] of Array.from(cleanup.entries())) {
      const byBook = new Map((result.get(userId) ?? []).map(book => [book.bookId, book]))
      for (const book of removed) byBook.set(book.bookId, book)
      result.set(userId, Array.from(byBook.values()).sort((left, right) => left.title.localeCompare(right.title)))
    }
  }
  return result
}

function cleanupArtifacts(cleanup: ConditionalCleanup, assignedUserIds: ReadonlySet<string>) {
  const entries = Array.from(cleanup.entries()).filter(([, removed]) => removed.length > 0)
  return {
    events: entries.map(([userId, removed]) => ({
      eventType: 'conditional_intents_cleared',
      subjectUserId: userId,
      after: { bookIds: removed.map(book => book.bookId), bookTitles: removed.map(book => book.title) },
    })),
    notices: entries.flatMap(([userId, removed]) => assignedUserIds.has(userId) ? [{
      userId,
      kind: 'conditional_intents_cleared',
      payload: { books: removed.map(book => book.title) },
    }] : []),
  }
}

async function rebuildAutomaticCircles(tx: DbClient, sessionId: string, bookId: string) {
  await tx.update(matchingBookAssignments)
    .set({ circleId: null })
    .where(and(
      eq(matchingBookAssignments.sessionId, sessionId),
      eq(matchingBookAssignments.bookId, bookId),
    ))
  await tx.delete(matchingCircles).where(and(
    eq(matchingCircles.sessionId, sessionId),
    eq(matchingCircles.bookId, bookId),
  ))

  const assignments = await tx.select({
    userId: matchingBookAssignments.userId,
    assignedAt: matchingBookAssignments.assignedAt,
  }).from(matchingBookAssignments).where(and(
    eq(matchingBookAssignments.sessionId, sessionId),
    eq(matchingBookAssignments.bookId, bookId),
  ))

  const partitions = partitionBookAssignments(assignments)
  for (let index = 0; index < partitions.length; index++) {
    const circleId = randomUUID()
    await tx.insert(matchingCircles).values({
      id: circleId,
      sessionId,
      bookId,
      position: index + 1,
    })
    await tx.update(matchingBookAssignments)
      .set({ circleId })
      .where(and(
        eq(matchingBookAssignments.sessionId, sessionId),
        eq(matchingBookAssignments.bookId, bookId),
        inArray(matchingBookAssignments.userId, partitions[index].map(item => item.userId)),
      ))
  }
}

async function formBookIfReady(
  tx: DbClient,
  sessionId: string,
  bookId: string,
  nextStateVersion: number,
  actor: MatchingTransitionActor,
): Promise<{ formed: boolean; assignedUserIds: string[]; conditionalCleanup: ConditionalCleanup }> {
  const [formed] = await tx.select({ bookId: matchingSessionBookStates.bookId })
    .from(matchingSessionBookStates)
    .where(and(
      eq(matchingSessionBookStates.sessionId, sessionId),
      eq(matchingSessionBookStates.bookId, bookId),
    ))
    .limit(1)
  if (formed) return { formed: false, assignedUserIds: [], conditionalCleanup: new Map() }

  const intents = await tx.select({
    userId: matchingBookIntents.userId,
    kind: matchingBookIntents.kind,
  }).from(matchingBookIntents).where(and(
    eq(matchingBookIntents.sessionId, sessionId),
    eq(matchingBookIntents.bookId, bookId),
  )).orderBy(asc(matchingBookIntents.createdAt), asc(matchingBookIntents.userId))
  const existingAssignments = await tx.select({ userId: matchingBookAssignments.userId })
    .from(matchingBookAssignments)
    .where(and(
      eq(matchingBookAssignments.sessionId, sessionId),
      eq(matchingBookAssignments.bookId, bookId),
    ))
  const plan = planBookFormation({
    formed: false,
    intents,
    assignedToBookUserIds: new Set(existingAssignments.map(item => item.userId)),
  })
  if (!plan) return { formed: false, assignedUserIds: [], conditionalCleanup: new Map() }

  await tx.insert(matchingSessionBookStates).values({
    sessionId,
    bookId,
    formedStateVersion: nextStateVersion,
  }).onConflictDoNothing()
  const now = new Date()
  for (const intent of plan.assignments) {
    await tx.insert(matchingBookAssignments).values({
      sessionId,
      userId: intent.userId,
      bookId,
      source: intent.source,
      assignedAt: now,
      assignedBy: actor.userId,
    })
  }
  const assignedUserIds = plan.clearIntentUserIds
  await tx.delete(matchingBookIntents).where(and(
    eq(matchingBookIntents.sessionId, sessionId),
    eq(matchingBookIntents.bookId, bookId),
    inArray(matchingBookIntents.userId, assignedUserIds),
  ))
  const conditionalCleanup = await clearConditionalIntents(tx, sessionId, assignedUserIds)
  await rebuildAutomaticCircles(tx, sessionId, bookId)
  return { formed: true, assignedUserIds, conditionalCleanup }
}

export async function applyBookMatchingAction(input: {
  tx: DbClient
  sessionId: string
  action: BookAction
  actor: MatchingTransitionActor
  nextStateVersion: number
}): Promise<MatchingActionResult> {
  const { tx, sessionId, action, actor, nextStateVersion } = input
  if (action.type === 'close_session' || action.type === 'reopen_session') {
    const target = action.type === 'close_session' ? 'closed' : 'open'
    const sourceStatuses = action.type === 'close_session' ? ['active', 'open'] : ['frozen', 'closed']
    let updated: Array<{ id: string }>
    try {
      updated = await tx.update(matchingSessions).set({ status: target })
        .where(and(eq(matchingSessions.id, sessionId), inArray(matchingSessions.status, sourceStatuses)))
        .returning({ id: matchingSessions.id })
    } catch (error) {
      if (action.type === 'reopen_session' && error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw new MatchingTransitionError('book_action_forbidden')
      }
      throw error
    }
    return updated.length > 0
      ? { changed: true, events: [{ eventType: `session_${target}`, actorUserId: actor.userId }] }
      : false
  }
  if (action.type === 'set_conditional') {
    await requireShortlistBook(tx, action.userId, action.bookId)
    const [formed, assignment, hard] = await Promise.all([
      tx.select({ bookId: matchingSessionBookStates.bookId }).from(matchingSessionBookStates).where(and(
        eq(matchingSessionBookStates.sessionId, sessionId), eq(matchingSessionBookStates.bookId, action.bookId),
      )).limit(1),
      tx.select({ userId: matchingBookAssignments.userId }).from(matchingBookAssignments).where(and(
        eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
        eq(matchingBookAssignments.bookId, action.bookId),
      )).limit(1),
      tx.select({ userId: matchingBookIntents.userId }).from(matchingBookIntents).where(and(
        eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
        eq(matchingBookIntents.kind, 'hard'),
      )).limit(1),
    ])
    if (formed.length || assignment.length || hard.length) throw new MatchingTransitionError('book_action_forbidden')
    const inserted = await tx.insert(matchingBookIntents).values({
      sessionId, userId: action.userId, bookId: action.bookId, kind: 'conditional',
    }).onConflictDoNothing().returning({ userId: matchingBookIntents.userId })
    if (!inserted.length) return false
    const outcome = await formBookIfReady(tx, sessionId, action.bookId, nextStateVersion, actor)
    const cleanup = cleanupArtifacts(outcome.conditionalCleanup, new Set(outcome.assignedUserIds))
    return {
      changed: true,
      events: [
        { eventType: 'conditional_set', subjectUserId: action.userId, bookId: action.bookId },
        ...(outcome.formed ? [{ eventType: 'book_formed', bookId: action.bookId, after: { assignedUserIds: outcome.assignedUserIds } }] : []),
        ...outcome.assignedUserIds.map(userId => ({
          eventType: 'participant_auto_assigned', subjectUserId: userId, bookId: action.bookId,
        })),
        ...cleanup.events,
      ],
      notices: cleanup.notices,
    }
  }
  if (action.type === 'unset_conditional') {
    const deleted = await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
      eq(matchingBookIntents.bookId, action.bookId), eq(matchingBookIntents.kind, 'conditional'),
    )).returning({ userId: matchingBookIntents.userId })
    return deleted.length ? { changed: true, events: [{ eventType: 'conditional_unset', subjectUserId: action.userId, bookId: action.bookId }] } : false
  }
  if (action.type === 'set_hard') {
    await requireShortlistBook(tx, action.userId, action.bookId)
    const [assignment] = await tx.select({ userId: matchingBookAssignments.userId })
      .from(matchingBookAssignments).where(and(
        eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
        eq(matchingBookAssignments.bookId, action.bookId),
      )).limit(1)
    if (assignment) throw new MatchingTransitionError('participant_locked')
    const [existing] = await tx.select({ bookId: matchingBookIntents.bookId })
      .from(matchingBookIntents).where(and(
        eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
        eq(matchingBookIntents.bookId, action.bookId),
        eq(matchingBookIntents.kind, 'hard'),
      )).limit(1)
    if (existing) return false
    const hardCleanup = await clearConditionalIntents(
      tx,
      sessionId,
      [action.userId],
      new Map([[action.userId, action.bookId]]),
    )
    const [formed] = await tx.select({ bookId: matchingSessionBookStates.bookId })
      .from(matchingSessionBookStates).where(and(
        eq(matchingSessionBookStates.sessionId, sessionId), eq(matchingSessionBookStates.bookId, action.bookId),
      )).limit(1)
    if (formed) {
      await tx.insert(matchingBookAssignments).values({
        sessionId, userId: action.userId, bookId: action.bookId, source: 'hard', assignedBy: actor.userId,
      })
      await rebuildAutomaticCircles(tx, sessionId, action.bookId)
    } else {
      await tx.insert(matchingBookIntents).values({
        sessionId, userId: action.userId, bookId: action.bookId, kind: 'hard',
      })
      const outcome = await formBookIfReady(tx, sessionId, action.bookId, nextStateVersion, actor)
      const combinedCleanup = mergeConditionalCleanup(hardCleanup, outcome.conditionalCleanup)
      const cleanup = cleanupArtifacts(combinedCleanup, new Set(outcome.assignedUserIds))
      return {
        changed: true,
        events: [
          { eventType: 'hard_set', subjectUserId: action.userId, bookId: action.bookId },
          ...(outcome.formed ? [{ eventType: 'book_formed', bookId: action.bookId, after: { assignedUserIds: outcome.assignedUserIds } }] : []),
          ...outcome.assignedUserIds.map(userId => ({
            eventType: 'participant_auto_assigned', subjectUserId: userId, bookId: action.bookId,
          })),
          ...cleanup.events,
        ],
        notices: cleanup.notices,
      }
    }
    const cleanup = cleanupArtifacts(hardCleanup, new Set([action.userId]))
    return {
      changed: true,
      events: [
        { eventType: 'hard_set', subjectUserId: action.userId, bookId: action.bookId },
        { eventType: 'participant_directly_assigned', subjectUserId: action.userId, bookId: action.bookId },
        ...cleanup.events,
      ],
      notices: cleanup.notices,
    }
  }
  if (action.type === 'cancel_hard') {
    const deleted = await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
      eq(matchingBookIntents.bookId, action.bookId),
      eq(matchingBookIntents.kind, 'hard'),
    )).returning({ bookId: matchingBookIntents.bookId })
    return deleted.length ? { changed: true, events: [{ eventType: 'hard_cancelled', subjectUserId: action.userId, bookId: action.bookId }] } : false
  }
  if (action.type === 'admin_assign_book') {
    await ensureShortlistBook(tx, action.userId, action.bookId)
    const [existing] = await tx.select({ bookId: matchingBookAssignments.bookId })
      .from(matchingBookAssignments).where(and(
        eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
        eq(matchingBookAssignments.bookId, action.bookId),
      )).limit(1)
    if (existing) return false
    await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
      eq(matchingBookIntents.bookId, action.bookId),
    ))
    const conditionalCleanup = await clearConditionalIntents(tx, sessionId, [action.userId])
    await tx.insert(matchingBookAssignments).values({
      sessionId, userId: action.userId, bookId: action.bookId, source: 'admin', assignedBy: actor.userId,
    })
    const cleanup = cleanupArtifacts(conditionalCleanup, new Set([action.userId]))
    return {
      changed: true,
      events: [
        { eventType: 'admin_book_assigned', subjectUserId: action.userId, bookId: action.bookId },
        ...cleanup.events,
      ],
      notices: cleanup.notices,
    }
  }
  if (action.type === 'admin_unassign_book') {
    const deleted = await tx.delete(matchingBookAssignments).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
      eq(matchingBookAssignments.bookId, action.bookId),
    )).returning({ bookId: matchingBookAssignments.bookId })
    return deleted.length ? { changed: true, events: [{ eventType: 'admin_book_unassigned', subjectUserId: action.userId, bookId: action.bookId }] } : false
  }
  if (action.type === 'admin_create_book_circle') {
    const existing = await tx.select({ position: matchingCircles.position }).from(matchingCircles)
      .where(and(eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.bookId, action.bookId)))
      .orderBy(asc(matchingCircles.position))
    const formed = await tx.insert(matchingSessionBookStates).values({
      sessionId, bookId: action.bookId, formedStateVersion: nextStateVersion,
    }).onConflictDoNothing().returning({ bookId: matchingSessionBookStates.bookId })
    await tx.insert(matchingCircles).values({
      sessionId, bookId: action.bookId, position: (existing.at(-1)?.position ?? 0) + 1,
    })
    return {
      changed: true,
      events: [
        ...(formed.length ? [{ eventType: 'book_formed', bookId: action.bookId, after: { assignedUserIds: [] } }] : []),
        { eventType: 'admin_circle_created', bookId: action.bookId },
      ],
    }
  }
  if (action.type === 'admin_delete_book_circle') {
    const [circle] = await tx.select({ bookId: matchingCircles.bookId }).from(matchingCircles).where(and(
      eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.id, action.circleId),
    )).limit(1)
    if (!circle) return false
    await tx.update(matchingBookAssignments).set({ circleId: null }).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.circleId, action.circleId),
    ))
    await tx.delete(matchingCircles).where(eq(matchingCircles.id, action.circleId))
    return { changed: true, events: [{ eventType: 'admin_circle_deleted', bookId: circle.bookId, metadata: { circleId: action.circleId } }] }
  }

  const [assignment] = await tx.select({ bookId: matchingBookAssignments.bookId })
    .from(matchingBookAssignments).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
      eq(matchingBookAssignments.bookId, action.bookId),
    )).limit(1)
  if (!assignment) throw new MatchingTransitionError('invalid_book_action')
  if (action.circleId) {
    const [circle] = await tx.select({ bookId: matchingCircles.bookId }).from(matchingCircles).where(and(
      eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.id, action.circleId),
    )).limit(1)
    if (!circle || circle.bookId !== assignment.bookId) throw new MatchingTransitionError('invalid_book_action')
  }
  const [currentPlacement] = await tx.select({ circleId: matchingBookAssignments.circleId })
    .from(matchingBookAssignments).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
      eq(matchingBookAssignments.bookId, action.bookId),
    )).limit(1)
  if (currentPlacement?.circleId === action.circleId) return false
  await tx.update(matchingBookAssignments).set({ circleId: action.circleId }).where(and(
    eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
    eq(matchingBookAssignments.bookId, action.bookId),
  ))
  return { changed: true, events: [{ eventType: 'admin_assignment_placed', subjectUserId: action.userId, bookId: assignment.bookId, metadata: { circleId: action.circleId } }] }
}

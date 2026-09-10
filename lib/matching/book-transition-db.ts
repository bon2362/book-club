import { randomUUID } from 'crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircles,
  matchingSessionBookStates,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
} from '@/lib/db/schema'
import { compactRanks, nextRank } from './rank-assignment'
import { planBookFormation, planCircleRebuild } from './book-partition'
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
    | 'admin_release_circle'
    | 'admin_return_circle'
    | 'admin_return_participant'
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

/**
 * Removes a book from the viewer's ranked list and closes the gap.
 *
 * Every other path that takes a book out of matching compacts the remaining ranks
 * (`changeStatus`, the catalog routes); deleting the row alone leaves holes in the
 * numbering the participant sees.
 */
async function detachBookFromPriorities(tx: DbClient, userId: string, bookId: string) {
  const deleted = await tx.delete(bookPriorities)
    .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
    .returning({ bookId: bookPriorities.bookId })
  if (deleted.length === 0) return
  const remaining = await tx.select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, userId))
  for (const row of compactRanks(remaining)) {
    await tx.update(bookPriorities)
      .set({ rank: row.rank, updatedAt: new Date() })
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, row.bookId)))
  }
}

async function rebuildAutomaticCircles(tx: DbClient, sessionId: string, bookId: string) {
  const circles = await tx.select({ id: matchingCircles.id, position: matchingCircles.position })
    .from(matchingCircles)
    .where(and(eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.bookId, bookId)))
  const assignments = await tx.select({
    userId: matchingBookAssignments.userId,
    circleId: matchingBookAssignments.circleId,
    assignedAt: matchingBookAssignments.assignedAt,
  }).from(matchingBookAssignments).where(and(
    eq(matchingBookAssignments.sessionId, sessionId),
    eq(matchingBookAssignments.bookId, bookId),
  ))
  const participantStates = await tx.select({
    userId: matchingSessionParticipants.userId,
    completedAt: matchingSessionParticipants.completedAt,
    completedCircleId: matchingSessionParticipants.completedCircleId,
  }).from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))

  const plan = planCircleRebuild({
    circles,
    assignments,
    releasedCircleIds: new Set(participantStates.flatMap(item => item.completedCircleId ? [item.completedCircleId] : [])),
    completedUserIds: new Set(participantStates.flatMap(item => item.completedAt !== null ? [item.userId] : [])),
  })

  // Detach before deleting: assignments reference circles by foreign key.
  if (plan.detachedUserIds.length > 0) {
    await tx.update(matchingBookAssignments).set({ circleId: null }).where(and(
      eq(matchingBookAssignments.sessionId, sessionId),
      eq(matchingBookAssignments.bookId, bookId),
      inArray(matchingBookAssignments.userId, plan.detachedUserIds),
    ))
  }
  if (plan.removedCircleIds.length > 0) {
    await tx.delete(matchingCircles).where(and(
      eq(matchingCircles.sessionId, sessionId),
      eq(matchingCircles.bookId, bookId),
      inArray(matchingCircles.id, plan.removedCircleIds),
    ))
  }
  for (const partition of plan.partitions) {
    const circleId = randomUUID()
    await tx.insert(matchingCircles).values({
      id: circleId,
      sessionId,
      bookId,
      position: partition.position,
    })
    await tx.update(matchingBookAssignments)
      .set({ circleId })
      .where(and(
        eq(matchingBookAssignments.sessionId, sessionId),
        eq(matchingBookAssignments.bookId, bookId),
        inArray(matchingBookAssignments.userId, partition.userIds),
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

  // Participants released to reading are out of matching: their leftover intents on other
  // books must not push those books over the formation threshold, and must never pull them
  // into a fresh circle they cannot see or act on.
  const intents = await tx.select({
    userId: matchingBookIntents.userId,
    kind: matchingBookIntents.kind,
  }).from(matchingBookIntents)
    .innerJoin(matchingSessionParticipants, and(
      eq(matchingSessionParticipants.sessionId, matchingBookIntents.sessionId),
      eq(matchingSessionParticipants.userId, matchingBookIntents.userId),
    ))
    .where(and(
      eq(matchingBookIntents.sessionId, sessionId),
      eq(matchingBookIntents.bookId, bookId),
      isNull(matchingSessionParticipants.completedAt),
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
  if (action.type === 'admin_release_circle') {
    const [circle] = await tx.select({ id: matchingCircles.id, bookId: matchingCircles.bookId }).from(matchingCircles).where(and(
      eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.id, action.circleId),
    )).limit(1)
    if (!circle) throw new MatchingTransitionError('invalid_book_action')
    const members = await tx.select({ userId: matchingBookAssignments.userId }).from(matchingBookAssignments).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.circleId, circle.id),
    ))
    if (members.length === 0) throw new MatchingTransitionError('invalid_book_action')
    const userIds = members.map(member => member.userId)
    const now = new Date()
    // The DB guard normally protects an assigned book from becoming "reading".
    // This marker exists only for this audited admin transaction.
    await tx.execute(sql`select set_config('app.matching_release_circle', 'on', true)`)
    await tx.update(matchingSessionParticipants).set({ completedAt: now, completedCircleId: circle.id }).where(and(
      eq(matchingSessionParticipants.sessionId, sessionId), inArray(matchingSessionParticipants.userId, userIds),
    ))
    for (const userId of userIds) {
      await tx.update(signupBooks).set({ personalStatus: 'reading', personalStatusUpdatedAt: now }).where(and(
        eq(signupBooks.userId, userId), eq(signupBooks.bookId, circle.bookId),
      ))
      await detachBookFromPriorities(tx, userId, circle.bookId)
    }
    return { changed: true, events: [{ eventType: 'circle_released', bookId: circle.bookId, after: { circleId: circle.id, userIds } }] }
  }
  if (action.type === 'admin_return_participant') {
    // Returns one member of a released circle to matching so they can pick a second book.
    // Their reading book and the circle itself stay exactly as they are: only the "out of
    // matching" marker is lifted. completed_circle_id is deliberately kept — it is what
    // keeps the reading circle safe from automatic re-partitioning.
    const [participant] = await tx.select({ completedAt: matchingSessionParticipants.completedAt })
      .from(matchingSessionParticipants).where(and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, action.userId),
      )).limit(1)
    if (!participant) throw new MatchingTransitionError('invalid_book_action')
    if (participant.completedAt === null) return false
    await tx.update(matchingSessionParticipants).set({ completedAt: null }).where(and(
      eq(matchingSessionParticipants.sessionId, sessionId),
      eq(matchingSessionParticipants.userId, action.userId),
    ))
    return {
      changed: true,
      events: [{ eventType: 'participant_returned_to_matching', subjectUserId: action.userId }],
    }
  }
  if (action.type === 'admin_return_circle') {
    const [circle] = await tx.select({ id: matchingCircles.id, bookId: matchingCircles.bookId }).from(matchingCircles).where(and(
      eq(matchingCircles.sessionId, sessionId), eq(matchingCircles.id, action.circleId),
    )).limit(1)
    if (!circle) throw new MatchingTransitionError('invalid_book_action')
    const members = await tx.select({ userId: matchingSessionParticipants.userId }).from(matchingSessionParticipants).where(and(
      eq(matchingSessionParticipants.sessionId, sessionId), eq(matchingSessionParticipants.completedCircleId, circle.id),
    ))
    if (members.length === 0) return false
    const userIds = members.map(member => member.userId)
    await tx.update(matchingSessionParticipants).set({ completedAt: null, completedCircleId: null }).where(and(
      eq(matchingSessionParticipants.sessionId, sessionId), inArray(matchingSessionParticipants.userId, userIds),
    ))
    for (const userId of userIds) {
      const [signup] = await tx.select({ personalStatus: signupBooks.personalStatus }).from(signupBooks).where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, circle.bookId))).limit(1)
      if (signup?.personalStatus === 'reading') {
        await tx.update(signupBooks).set({ personalStatus: null, personalStatusUpdatedAt: new Date() }).where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, circle.bookId)))
        const ranks = await tx.select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank }).from(bookPriorities).where(eq(bookPriorities.userId, userId))
        await tx.insert(bookPriorities).values({ userId, bookId: circle.bookId, rank: nextRank(ranks), rankSource: 'auto' }).onConflictDoNothing()
      }
    }
    return { changed: true, events: [{ eventType: 'circle_returned', bookId: circle.bookId, after: { circleId: circle.id, userIds } }] }
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

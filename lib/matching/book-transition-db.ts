import { randomUUID } from 'crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  matchingBookAssignments,
  matchingBookIntents,
  matchingCircleConfirmations,
  matchingCircles,
  matchingLockedCircleMembers,
  matchingLockedCircles,
  matchingSessionBookStates,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
} from '@/lib/db/schema'
import { nextRank } from './rank-assignment'
import { partitionBookAssignments, planBookFormation } from './book-partition'
import { planLegacyBookModeImport } from './book-import'
import {
  MatchingTransitionError,
  type MatchingAction,
  type MatchingActionResult,
  type MatchingTransitionActor,
} from './session-transition'

type DbClient = typeof db
type BookAction = Extract<MatchingAction, {
  type:
    | 'initialize_book_mode'
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

async function ensureImportedShortlistBook(tx: DbClient, userId: string, bookId: string) {
  const [existing] = await tx.select({ personalStatus: signupBooks.personalStatus })
    .from(signupBooks)
    .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    .limit(1)
  if (existing && existing.personalStatus !== null) throw new MatchingTransitionError('invalid_book_action')
  if (!existing) await ensureShortlistBook(tx, userId, bookId)
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
): Promise<{ formed: boolean; assignedUserIds: string[] }> {
  const [formed] = await tx.select({ bookId: matchingSessionBookStates.bookId })
    .from(matchingSessionBookStates)
    .where(and(
      eq(matchingSessionBookStates.sessionId, sessionId),
      eq(matchingSessionBookStates.bookId, bookId),
    ))
    .limit(1)
  if (formed) return { formed: false, assignedUserIds: [] }

  const intents = await tx.select({
    userId: matchingBookIntents.userId,
    kind: matchingBookIntents.kind,
  }).from(matchingBookIntents).where(and(
    eq(matchingBookIntents.sessionId, sessionId),
    eq(matchingBookIntents.bookId, bookId),
  )).orderBy(asc(matchingBookIntents.createdAt), asc(matchingBookIntents.userId))
  const existingAssignments = await tx.select({ userId: matchingBookAssignments.userId })
    .from(matchingBookAssignments)
    .where(eq(matchingBookAssignments.sessionId, sessionId))
  const plan = planBookFormation({
    formed: false,
    intents,
    assignedUserIds: new Set(existingAssignments.map(item => item.userId)),
  })
  if (!plan) return { formed: false, assignedUserIds: [] }

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
    inArray(matchingBookIntents.userId, assignedUserIds),
  ))
  await rebuildAutomaticCircles(tx, sessionId, bookId)
  return { formed: true, assignedUserIds }
}

async function initializeBookMode(
  tx: DbClient,
  sessionId: string,
  nextStateVersion: number,
  actor: MatchingTransitionActor,
): Promise<MatchingActionResult> {
  const participants = await tx.select({ userId: matchingSessionParticipants.userId })
    .from(matchingSessionParticipants)
    .where(eq(matchingSessionParticipants.sessionId, sessionId))
  const participantIds = new Set(participants.map(item => item.userId))
  const legacyCircles = await tx.select({
    id: matchingLockedCircles.id,
    bookId: matchingLockedCircles.bookId,
    lockedAt: matchingLockedCircles.lockedAt,
  }).from(matchingLockedCircles).where(and(
    eq(matchingLockedCircles.sessionId, sessionId),
    eq(matchingLockedCircles.status, 'locked'),
  )).orderBy(asc(matchingLockedCircles.lockedAt), asc(matchingLockedCircles.id))
  const legacyMembers = legacyCircles.length > 0
    ? await tx.select({
      circleId: matchingLockedCircleMembers.circleId,
      userId: matchingLockedCircleMembers.userId,
    }).from(matchingLockedCircleMembers).where(and(
      inArray(matchingLockedCircleMembers.circleId, legacyCircles.map(circle => circle.id)),
      isNull(matchingLockedCircleMembers.releasedAt),
    ))
    : []

  const confirmations = await tx.select({
    userId: matchingCircleConfirmations.userId,
    bookId: matchingCircleConfirmations.bookId,
  }).from(matchingCircleConfirmations).where(eq(matchingCircleConfirmations.sessionId, sessionId))
  const importPlan = planLegacyBookModeImport({
    participantUserIds: participantIds,
    circles: legacyCircles,
    members: legacyMembers,
    confirmations,
  })

  const positionByBook = new Map<string, number>()
  for (const circle of legacyCircles) {
    const members = legacyMembers.filter(member => member.circleId === circle.id)
    if (members.length === 0) throw new MatchingTransitionError('invalid_book_action')
    const position = (positionByBook.get(circle.bookId) ?? 0) + 1
    positionByBook.set(circle.bookId, position)
    await tx.insert(matchingSessionBookStates).values({
      sessionId,
      bookId: circle.bookId,
      formedStateVersion: nextStateVersion,
    }).onConflictDoNothing()
    const newCircleId = randomUUID()
    await tx.insert(matchingCircles).values({
      id: newCircleId,
      sessionId,
      bookId: circle.bookId,
      position,
      legacyLockedCircleId: circle.id,
    })
    for (const member of members) {
      await ensureImportedShortlistBook(tx, member.userId, circle.bookId)
      await tx.insert(matchingBookAssignments).values({
        sessionId,
        userId: member.userId,
        bookId: circle.bookId,
        source: 'legacy',
        assignedBy: actor.userId,
        circleId: newCircleId,
      })
    }
  }

  const affectedBookIds = new Set<string>()
  for (const confirmation of importPlan.confirmations) {
    await ensureImportedShortlistBook(tx, confirmation.userId, confirmation.bookId)
    await tx.insert(matchingBookIntents).values({
      sessionId,
      userId: confirmation.userId,
      bookId: confirmation.bookId,
      kind: 'hard',
    }).onConflictDoUpdate({
      target: [matchingBookIntents.sessionId, matchingBookIntents.userId, matchingBookIntents.bookId],
      set: { kind: 'hard', updatedAt: new Date() },
    })
    affectedBookIds.add(confirmation.bookId)
  }
  const formationEvents: Omit<import('./session-transition').MatchingEventDraft, 'stateVersion'>[] = []
  for (const bookId of Array.from(affectedBookIds)) {
    const outcome = await formBookIfReady(tx, sessionId, bookId, nextStateVersion, actor)
    if (outcome.formed) {
      formationEvents.push({ eventType: 'book_formed', bookId, after: { assignedUserIds: outcome.assignedUserIds } })
      formationEvents.push(...outcome.assignedUserIds.map(userId => ({
        eventType: 'participant_auto_assigned', subjectUserId: userId, bookId,
      })))
    }
  }

  const [session] = await tx.select({ status: matchingSessions.status })
    .from(matchingSessions).where(eq(matchingSessions.id, sessionId)).limit(1)
  await tx.update(matchingSessions).set({
    status: session?.status === 'frozen' || session?.status === 'closed' ? 'closed' : 'open',
    bookModeInitializedAt: new Date(),
  }).where(eq(matchingSessions.id, sessionId))
  return {
    changed: true,
    events: [
      ...legacyCircles.map(circle => ({
        eventType: 'legacy_circle_imported',
        actorUserId: actor.userId,
        bookId: circle.bookId,
        metadata: { legacyLockedCircleId: circle.id },
      })),
      ...importPlan.confirmations.map(confirmation => ({
        eventType: 'legacy_confirmation_imported',
        actorUserId: actor.userId,
        subjectUserId: confirmation.userId,
        bookId: confirmation.bookId,
      })),
      ...formationEvents,
      {
        eventType: 'book_mode_initialized',
        actorUserId: actor.userId,
        after: {
          importedCircles: legacyCircles.length,
          importedConfirmations: importPlan.confirmations.length,
        },
      },
    ],
  }
}

export async function applyBookMatchingAction(input: {
  tx: DbClient
  sessionId: string
  action: BookAction
  actor: MatchingTransitionActor
  nextStateVersion: number
}): Promise<MatchingActionResult> {
  const { tx, sessionId, action, actor, nextStateVersion } = input
  if (action.type === 'initialize_book_mode') {
    return initializeBookMode(tx, sessionId, nextStateVersion, actor)
  }
  if (action.type === 'close_session' || action.type === 'reopen_session') {
    const target = action.type === 'close_session' ? 'closed' : 'open'
    let updated: Array<{ id: string }>
    try {
      updated = await tx.update(matchingSessions).set({ status: target })
        .where(and(eq(matchingSessions.id, sessionId), eq(matchingSessions.status, target === 'open' ? 'closed' : 'open')))
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
    return {
      changed: true,
      events: [
        { eventType: 'conditional_set', subjectUserId: action.userId, bookId: action.bookId },
        ...(outcome.formed ? [{ eventType: 'book_formed', bookId: action.bookId, after: { assignedUserIds: outcome.assignedUserIds } }] : []),
        ...outcome.assignedUserIds.map(userId => ({
          eventType: 'participant_auto_assigned', subjectUserId: userId, bookId: action.bookId,
        })),
      ],
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
      )).limit(1)
    if (assignment) throw new MatchingTransitionError('participant_locked')
    const [existing] = await tx.select({ bookId: matchingBookIntents.bookId })
      .from(matchingBookIntents).where(and(
        eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
        eq(matchingBookIntents.kind, 'hard'),
      )).limit(1)
    if (existing?.bookId === action.bookId) return false
    await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
    ))
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
      return {
        changed: true,
        events: [
          { eventType: existing ? 'hard_switched' : 'hard_set', subjectUserId: action.userId, bookId: action.bookId },
          ...(outcome.formed ? [{ eventType: 'book_formed', bookId: action.bookId, after: { assignedUserIds: outcome.assignedUserIds } }] : []),
          ...outcome.assignedUserIds.map(userId => ({
            eventType: 'participant_auto_assigned', subjectUserId: userId, bookId: action.bookId,
          })),
        ],
      }
    }
    return {
      changed: true,
      events: [
        { eventType: existing ? 'hard_switched' : 'hard_set', subjectUserId: action.userId, bookId: action.bookId },
        { eventType: 'participant_directly_assigned', subjectUserId: action.userId, bookId: action.bookId },
      ],
    }
  }
  if (action.type === 'cancel_hard') {
    const deleted = await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
      eq(matchingBookIntents.kind, 'hard'),
    )).returning({ bookId: matchingBookIntents.bookId })
    return deleted.length ? { changed: true, events: [{ eventType: 'hard_cancelled', subjectUserId: action.userId, bookId: deleted[0].bookId }] } : false
  }
  if (action.type === 'admin_assign_book') {
    await ensureShortlistBook(tx, action.userId, action.bookId)
    const [existing] = await tx.select({ bookId: matchingBookAssignments.bookId })
      .from(matchingBookAssignments).where(and(
        eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
      )).limit(1)
    if (existing?.bookId === action.bookId) return false
    await tx.delete(matchingBookIntents).where(and(
      eq(matchingBookIntents.sessionId, sessionId), eq(matchingBookIntents.userId, action.userId),
    ))
    await tx.insert(matchingBookAssignments).values({
      sessionId, userId: action.userId, bookId: action.bookId, source: 'admin', assignedBy: actor.userId,
    }).onConflictDoUpdate({
      target: [matchingBookAssignments.sessionId, matchingBookAssignments.userId],
      set: { bookId: action.bookId, source: 'admin', assignedBy: actor.userId, assignedAt: new Date(), circleId: null },
    })
    return { changed: true, events: [{ eventType: existing ? 'admin_book_transferred' : 'admin_book_assigned', subjectUserId: action.userId, bookId: action.bookId, before: existing ?? null }] }
  }
  if (action.type === 'admin_unassign_book') {
    const deleted = await tx.delete(matchingBookAssignments).where(and(
      eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
    )).returning({ bookId: matchingBookAssignments.bookId })
    return deleted.length ? { changed: true, events: [{ eventType: 'admin_book_unassigned', subjectUserId: action.userId, bookId: deleted[0].bookId }] } : false
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
    )).limit(1)
  if (currentPlacement?.circleId === action.circleId) return false
  await tx.update(matchingBookAssignments).set({ circleId: action.circleId }).where(and(
    eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, action.userId),
  ))
  return { changed: true, events: [{ eventType: 'admin_assignment_placed', subjectUserId: action.userId, bookId: assignment.bookId, metadata: { circleId: action.circleId } }] }
}

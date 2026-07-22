import { randomUUID } from 'crypto'
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingCircleConfirmations,
  matchingBookAssignments,
  matchingBookIntents,
  matchingEvents,
  matchingLockedCircleMembers,
  matchingLockedCircles,
  matchingNotices,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { upsertSignupByBookIds } from '@/lib/signup-books'
import { assignMatchingDisplayNames } from './display-names'
import { buildMatchingEventRows } from './matching-events'
import { nextRank } from './rank-assignment'
import { applyBookMatchingAction } from './book-transition-db'
import { fetchRankedMatchingScenarios } from './reconciliation-scenarios-db'
import {
  executeMatchingTransition,
  MatchingTransitionError,
  resolveParticipantRole,
  type MatchingAction,
  type MatchingActionResult,
  type MatchingEventDraft,
  type MatchingNoticeDraft,
  type MatchingTransitionActor,
  type MatchingTransitionStore,
} from './session-transition'
import type {
  CircleConfirmation,
  RankedReconciliationScenario,
  ReconciliationCircle,
} from './confirmation-reconciliation'

type DbClient = typeof db

export function shouldEnforceCatalogMatchingLocks(sessionStatus: string): boolean {
  return sessionStatus !== 'closed' && sessionStatus !== 'frozen'
}

function executeRows<T>(result: unknown): T[] {
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows
  }
  return result as T[]
}

class DrizzleMatchingTransitionStore implements MatchingTransitionStore {
  constructor(
    private readonly tx: DbClient,
    private readonly actor: MatchingTransitionActor,
  ) {}

  async lockSession(sessionId: string) {
    const result = await this.tx.execute(sql`
      SELECT status, state_version AS "stateVersion",
             book_mode_initialized_at AS "bookModeInitializedAt"
      FROM matching_sessions
      WHERE id = ${sessionId}
      FOR UPDATE
    `)
    return executeRows<{
      status: string
      stateVersion: number
      bookModeInitializedAt: Date | null
    }>(result)[0] ?? null
  }

  async getParticipantRole(sessionId: string, userId: string) {
    const [participant] = await this.tx
      .select({ userId: matchingSessionParticipants.userId })
      .from(matchingSessionParticipants)
      .where(and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, userId),
      ))
      .limit(1)
    if (!participant) return 'missing' as const

    const [assignmentRows, lockedRows, sessionRows] = await Promise.all([
      this.tx.select({ userId: matchingBookAssignments.userId })
        .from(matchingBookAssignments)
        .where(and(eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, userId)))
        .limit(1),
      this.tx.select({ userId: matchingLockedCircleMembers.userId })
        .from(matchingLockedCircleMembers)
        .where(and(
          eq(matchingLockedCircleMembers.sessionId, sessionId),
          eq(matchingLockedCircleMembers.userId, userId),
          isNull(matchingLockedCircleMembers.releasedAt),
        )).limit(1),
      this.tx.select({ initializedAt: matchingSessions.bookModeInitializedAt })
        .from(matchingSessions).where(eq(matchingSessions.id, sessionId)).limit(1),
    ])
    return resolveParticipantRole({
      bookModeInitialized: Boolean(sessionRows[0]?.initializedAt),
      hasBookAssignment: assignmentRows.length > 0,
      hasLegacyLock: lockedRows.length > 0,
    })
  }

  async getRankedScenarios(sessionId: string): Promise<RankedReconciliationScenario[]> {
    return fetchRankedMatchingScenarios(sessionId, this.tx)
  }

  async getConfirmations(sessionId: string): Promise<CircleConfirmation[]> {
    return this.tx
      .select({
        userId: matchingCircleConfirmations.userId,
        bookId: matchingCircleConfirmations.bookId,
        circleKey: matchingCircleConfirmations.circleKey,
        memberUserIds: matchingCircleConfirmations.memberUserIdsJson,
      })
      .from(matchingCircleConfirmations)
      .where(eq(matchingCircleConfirmations.sessionId, sessionId))
  }

  async getDisplayNames(sessionId: string): Promise<ReadonlyMap<string, string>> {
    const rows = await this.tx
      .select({
        userId: matchingSessionParticipants.userId,
        publicRef: matchingSessionParticipants.publicRef,
        joinedAt: matchingSessionParticipants.joinedAt,
        name: users.name,
      })
      .from(matchingSessionParticipants)
      .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
      .where(eq(matchingSessionParticipants.sessionId, sessionId))
    return assignMatchingDisplayNames(rows)
  }

  async hasLatestConfirmationOutcome(input: {
    sessionId: string
    userId: string
    afterStateVersion: number
    throughStateVersion: number
    participantRole: 'active' | 'observer'
    outcome: 'set' | 'cancel'
    circleKey?: string
  }): Promise<boolean> {
    const semanticEventTypes = [
      'confirmation_created',
      'confirmation_switched',
      'confirmation_cancelled',
      'confirmation_transferred',
      'confirmation_invalidated',
    ]
    const [events, current] = await Promise.all([
      this.tx
        .select({ eventType: matchingEvents.eventType, after: matchingEvents.after })
        .from(matchingEvents)
        .where(and(
          eq(matchingEvents.sessionId, input.sessionId),
          eq(matchingEvents.subjectUserId, input.userId),
          gt(matchingEvents.stateVersion, input.afterStateVersion),
          lte(matchingEvents.stateVersion, input.throughStateVersion),
          inArray(matchingEvents.eventType, semanticEventTypes),
        ))
        .orderBy(
          desc(matchingEvents.stateVersion),
          desc(sql<number>`CASE
            WHEN ${matchingEvents.eventType} = 'confirmation_invalidated' THEN 2
            WHEN ${matchingEvents.eventType} = 'confirmation_transferred' THEN 2
            ELSE 1
          END`),
        )
        .limit(1),
      this.tx
        .select({ circleKey: matchingCircleConfirmations.circleKey })
        .from(matchingCircleConfirmations)
        .where(and(
          eq(matchingCircleConfirmations.sessionId, input.sessionId),
          eq(matchingCircleConfirmations.userId, input.userId),
        ))
        .limit(1),
    ])
    const latest = events[0]
    const currentCircleKey = current[0]?.circleKey ?? null
    if (!latest) return false
    if (input.outcome === 'cancel') {
      return input.participantRole === 'active' &&
        latest.eventType === 'confirmation_cancelled' &&
        currentCircleKey === null
    }
    const latestCircleKey = latest.after && typeof latest.after === 'object' && 'circleKey' in latest.after
      ? latest.after.circleKey
      : null
    const latestIsSet = [
      'confirmation_created',
      'confirmation_switched',
      'confirmation_transferred',
    ].includes(latest.eventType)
    return latestIsSet && latestCircleKey === input.circleKey && (
      currentCircleKey === input.circleKey || (
        currentCircleKey === null && input.participantRole === 'observer'
      )
    )
  }

  async upsertConfirmation(sessionId: string, confirmation: CircleConfirmation): Promise<void> {
    await this.tx
      .insert(matchingCircleConfirmations)
      .values({
        sessionId,
        userId: confirmation.userId,
        bookId: confirmation.bookId,
        circleKey: confirmation.circleKey,
        memberUserIdsJson: confirmation.memberUserIds,
      })
      .onConflictDoUpdate({
        target: [matchingCircleConfirmations.sessionId, matchingCircleConfirmations.userId],
        set: {
          bookId: confirmation.bookId,
          circleKey: confirmation.circleKey,
          memberUserIdsJson: confirmation.memberUserIds,
          updatedAt: new Date(),
        },
      })
  }

  async deleteConfirmation(sessionId: string, userId: string): Promise<boolean> {
    const deleted = await this.tx
      .delete(matchingCircleConfirmations)
      .where(and(
        eq(matchingCircleConfirmations.sessionId, sessionId),
        eq(matchingCircleConfirmations.userId, userId),
      ))
      .returning({ userId: matchingCircleConfirmations.userId })
    return deleted.length > 0
  }

  async applyAction(
    sessionId: string,
    action: MatchingAction,
    nextStateVersion: number,
    context: { sessionStatus: string },
  ): Promise<MatchingActionResult> {
    if ([
      'initialize_book_mode', 'set_conditional', 'unset_conditional', 'set_hard',
      'cancel_hard', 'admin_assign_book', 'admin_unassign_book',
      'admin_create_book_circle', 'admin_delete_book_circle',
      'admin_place_book_assignment', 'close_session', 'reopen_session',
    ].includes(action.type)) {
      return applyBookMatchingAction({
        tx: this.tx,
        sessionId,
        action: action as Parameters<typeof applyBookMatchingAction>[0]['action'],
        actor: this.actor,
        nextStateVersion,
      })
    }
    switch (action.type) {
      case 'self_join':
      case 'admin_add': {
        let changed = false
        let previousName: string | null = null
        let nameChanged = false
        if (action.type === 'self_join' && action.name !== undefined) {
          const [current] = await this.tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, action.userId))
            .limit(1)
          if (current && current.name !== action.name) {
            previousName = current.name
            await this.tx.update(users).set({ name: action.name }).where(eq(users.id, action.userId))
            changed = true
            nameChanged = true
          }
        }
        const inserted = await this.tx
          .insert(matchingSessionParticipants)
          .values({
            sessionId,
            userId: action.userId,
            publicRef: randomUUID(),
            joinSource: action.type === 'admin_add' ? 'admin' : 'self',
          })
          .onConflictDoNothing()
          .returning({ userId: matchingSessionParticipants.userId })
        const joined = inserted.length > 0
        if (action.type === 'self_join' && nameChanged) {
          return {
            changed: true,
            events: [
              ...(joined ? [{ eventType: 'self_join', actorUserId: this.actor.userId, subjectUserId: action.userId }] : []),
              {
                eventType: 'welcome_name_changed',
                actorUserId: this.actor.userId,
                subjectUserId: action.userId,
                before: { name: previousName },
                after: { name: action.name },
              },
            ],
          }
        }
        return changed || joined
      }
      case 'leave':
      case 'admin_remove': {
        if (action.type === 'admin_remove') {
          await this.tx.delete(matchingBookAssignments).where(and(
            eq(matchingBookAssignments.sessionId, sessionId),
            eq(matchingBookAssignments.userId, action.userId),
          ))
        }
        const deleted = await this.tx
          .delete(matchingSessionParticipants)
          .where(and(
            eq(matchingSessionParticipants.sessionId, sessionId),
            eq(matchingSessionParticipants.userId, action.userId),
          ))
          .returning({ userId: matchingSessionParticipants.userId })
        return deleted.length > 0
      }
      case 'change_book':
        return this.changeBook(sessionId, action.userId, action.bookId, action.operation, context.sessionStatus)
      case 'change_rank':
        return this.changeRank(action.userId, action.bookId, action.rank)
      case 'change_status':
        return this.changeStatus(sessionId, action.userId, action.bookId, action.status, context.sessionStatus)
      case 'replace_signup':
        return this.replaceSignup(sessionId, action.userId, action.name, action.contacts, action.bookIds)
      case 'reorder_priorities':
        return this.reorderPriorities(action.userId, action.bookIds)
      case 'change_group_size': {
        const updated = await this.tx
          .update(matchingSessions)
          .set({ minGroupSize: action.min, maxGroupSize: action.max })
          .where(eq(matchingSessions.id, sessionId))
          .returning({ id: matchingSessions.id })
        return updated.length > 0
      }
      case 'dissolve_circle': {
        const now = new Date()
        const [circle] = await this.tx
          .select({
            id: matchingLockedCircles.id,
            bookId: matchingLockedCircles.bookId,
            circleKey: matchingLockedCircles.circleKey,
          })
          .from(matchingLockedCircles)
          .where(and(
            eq(matchingLockedCircles.id, action.circleId),
            eq(matchingLockedCircles.sessionId, sessionId),
            eq(matchingLockedCircles.status, 'locked'),
          ))
          .limit(1)
        if (!circle) return false
        const members = await this.tx
          .select({
            userId: matchingLockedCircleMembers.userId,
            displayNameSnapshot: matchingLockedCircleMembers.displayNameSnapshot,
          })
          .from(matchingLockedCircleMembers)
          .where(and(
            eq(matchingLockedCircleMembers.circleId, action.circleId),
            isNull(matchingLockedCircleMembers.releasedAt),
          ))
        const dissolved = await this.tx
          .update(matchingLockedCircles)
          .set({
            status: 'dissolved',
            dissolvedAt: now,
            dissolvedBy: this.actor.userId,
            dissolveReason: action.reason,
          })
          .where(and(
            eq(matchingLockedCircles.id, action.circleId),
            eq(matchingLockedCircles.sessionId, sessionId),
            eq(matchingLockedCircles.status, 'locked'),
          ))
          .returning({ id: matchingLockedCircles.id })
        if (dissolved.length === 0) return false
        await this.tx
          .update(matchingLockedCircleMembers)
          .set({ releasedAt: now })
          .where(and(
            eq(matchingLockedCircleMembers.circleId, action.circleId),
            isNull(matchingLockedCircleMembers.releasedAt),
          ))
        return {
          changed: true,
          events: [{
            eventType: 'circle_dissolved',
            actorUserId: this.actor.userId,
            bookId: circle.bookId,
            before: {
              circleKey: circle.circleKey,
              members: members.map((member) => ({ ...member })),
            },
            after: { status: 'dissolved' },
            metadata: {
              reason: action.reason,
              circleKey: circle.circleKey,
              memberUserIds: members.map((member) => member.userId),
              memberDisplayNames: members.map((member) => member.displayNameSnapshot),
            },
          }],
          notices: members.map((member) => ({
            userId: member.userId,
            kind: 'circle_dissolved',
            payload: {
              bookId: circle.bookId,
              memberDisplayNames: members.map((item) => item.displayNameSnapshot),
              reason: action.reason,
            },
          })),
        }
      }
      case 'freeze': {
        const rankedScenarios = await this.getRankedScenarios(sessionId)
        const frozenAt = new Date()
        await this.tx.delete(matchingCircleConfirmations)
          .where(eq(matchingCircleConfirmations.sessionId, sessionId))
        const updated = await this.tx
          .update(matchingSessions)
          .set({
            status: 'frozen',
            frozenAt,
            frozenScenarioJson: { remainingLeader: rankedScenarios[0] ?? null },
          })
          .where(eq(matchingSessions.id, sessionId))
          .returning({ id: matchingSessions.id })
        return updated.length > 0
      }
      case 'set_confirmation':
      case 'cancel_confirmation':
      case 'initialize_book_mode':
      case 'set_conditional':
      case 'unset_conditional':
      case 'set_hard':
      case 'cancel_hard':
      case 'admin_assign_book':
      case 'admin_unassign_book':
      case 'admin_create_book_circle':
      case 'admin_delete_book_circle':
      case 'admin_place_book_assignment':
      case 'close_session':
      case 'reopen_session':
        return false
    }
  }

  private async changeBook(
    sessionId: string,
    userId: string,
    bookId: string,
    operation: 'add' | 'remove',
    sessionStatus: string,
  ): Promise<boolean> {
    if (operation === 'add') {
      const inserted = await this.tx
        .insert(signupBooks)
        .values({ userId, bookId })
        .onConflictDoNothing()
        .returning({ bookId: signupBooks.bookId })
      if (inserted.length > 0) {
        const ranked = await this.tx
          .select({ rank: bookPriorities.rank })
          .from(bookPriorities)
          .where(eq(bookPriorities.userId, userId))
        await this.tx
          .insert(bookPriorities)
          .values({ userId, bookId, rank: nextRank(ranked.map(r => ({ bookId, rank: r.rank }))), rankSource: 'auto' })
          .onConflictDoNothing()
      }
      return inserted.length > 0
    }

    if (shouldEnforceCatalogMatchingLocks(sessionStatus)) {
      const [assignment] = await this.tx.select({ userId: matchingBookAssignments.userId })
        .from(matchingBookAssignments).where(and(
          eq(matchingBookAssignments.sessionId, sessionId),
          eq(matchingBookAssignments.userId, userId),
          eq(matchingBookAssignments.bookId, bookId),
        )).limit(1)
      if (assignment) throw new MatchingTransitionError('participant_locked')
      const [intent] = await this.tx.select({ kind: matchingBookIntents.kind })
        .from(matchingBookIntents).where(and(
          eq(matchingBookIntents.sessionId, sessionId),
          eq(matchingBookIntents.userId, userId),
          eq(matchingBookIntents.bookId, bookId),
        )).limit(1)
      if (intent?.kind === 'hard') throw new MatchingTransitionError('book_action_forbidden')
      if (intent?.kind === 'conditional') {
        await this.tx.delete(matchingBookIntents).where(and(
          eq(matchingBookIntents.sessionId, sessionId),
          eq(matchingBookIntents.userId, userId),
          eq(matchingBookIntents.bookId, bookId),
        ))
      }
    }

    const deleted = await this.tx
      .delete(signupBooks)
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
      .returning({ bookId: signupBooks.bookId })
    await this.tx
      .delete(bookPriorities)
      .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
    const remaining = await this.tx
      .select({ bookId: bookPriorities.bookId })
      .from(bookPriorities)
      .where(eq(bookPriorities.userId, userId))
      .orderBy(asc(bookPriorities.rank))
    for (let index = 0; index < remaining.length; index++) {
      await this.tx
        .update(bookPriorities)
        .set({ rank: index + 1, updatedAt: new Date() })
        .where(and(
          eq(bookPriorities.userId, userId),
          eq(bookPriorities.bookId, remaining[index].bookId),
        ))
    }
    return deleted.length > 0
  }

  private async reorderPriorities(userId: string, bookIds: string[]): Promise<boolean> {
    for (let index = 0; index < bookIds.length; index++) {
      await this.tx
        .insert(bookPriorities)
        .values({ userId, bookId: bookIds[index], rank: index + 1, rankSource: 'manual' })
        .onConflictDoUpdate({
          target: [bookPriorities.userId, bookPriorities.bookId],
          set: { rank: index + 1, rankSource: 'manual', updatedAt: new Date() },
        })
    }
    await this.tx.update(users).set({ prioritiesSet: true }).where(eq(users.id, userId))
    return true
  }

  private async replaceSignup(
    sessionId: string,
    userId: string,
    name: string,
    contacts: string,
    bookIds: string[],
  ): Promise<boolean> {
    const desiredBookIds = new Set(bookIds)
    const currentMatchingBooks = await this.tx.select({ bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(and(eq(signupBooks.userId, userId), isNull(signupBooks.personalStatus)))
    const removedBookIds = currentMatchingBooks
      .map(item => item.bookId)
      .filter(bookId => !desiredBookIds.has(bookId))
    if (removedBookIds.length > 0) {
      const [assignment, hard] = await Promise.all([
        this.tx.select({ bookId: matchingBookAssignments.bookId }).from(matchingBookAssignments).where(and(
          eq(matchingBookAssignments.sessionId, sessionId),
          eq(matchingBookAssignments.userId, userId),
          inArray(matchingBookAssignments.bookId, removedBookIds),
        )).limit(1),
        this.tx.select({ bookId: matchingBookIntents.bookId }).from(matchingBookIntents).where(and(
          eq(matchingBookIntents.sessionId, sessionId),
          eq(matchingBookIntents.userId, userId),
          eq(matchingBookIntents.kind, 'hard'),
          inArray(matchingBookIntents.bookId, removedBookIds),
        )).limit(1),
      ])
      if (assignment.length) throw new MatchingTransitionError('participant_locked')
      if (hard.length) throw new MatchingTransitionError('book_action_forbidden')
      await this.tx.delete(matchingBookIntents).where(and(
        eq(matchingBookIntents.sessionId, sessionId),
        eq(matchingBookIntents.userId, userId),
        eq(matchingBookIntents.kind, 'conditional'),
        inArray(matchingBookIntents.bookId, removedBookIds),
      ))
    }
    const [currentUser] = await this.tx
      .select({ name: users.name, contacts: users.contacts })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const result = await upsertSignupByBookIds(userId, bookIds, this.tx)

    const normalizedName = name.trim()
    const normalizedContacts = contacts.trim()
    const profileChanged = Boolean(currentUser) && (
      currentUser.name !== normalizedName || currentUser.contacts !== normalizedContacts
    )
    if (profileChanged || result.addedBookIds.length === 0) {
      await this.tx
        .update(users)
        .set({
          name: normalizedName,
          contacts: normalizedContacts,
          ...(result.addedBookIds.length === 0 ? { prioritiesSet: false } : {}),
        })
        .where(eq(users.id, userId))
    }

    return profileChanged || result.newlyAddedBookIds.length > 0 || result.removedBookIds.length > 0
  }

  private async changeStatus(
    sessionId: string,
    userId: string,
    bookId: string,
    status: 'reading' | 'read' | null,
    sessionStatus: string,
  ): Promise<boolean> {
    const [signup] = await this.tx
      .select({ personalStatus: signupBooks.personalStatus })
      .from(signupBooks)
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
      .limit(1)
    if (!signup) return false
    const statusChanged = signup.personalStatus !== status

    if (status !== null && shouldEnforceCatalogMatchingLocks(sessionStatus)) {
      const [assignment] = await this.tx.select({ userId: matchingBookAssignments.userId })
        .from(matchingBookAssignments).where(and(
          eq(matchingBookAssignments.sessionId, sessionId),
          eq(matchingBookAssignments.userId, userId),
          eq(matchingBookAssignments.bookId, bookId),
        )).limit(1)
      if (assignment) throw new MatchingTransitionError('participant_locked')
      const [intent] = await this.tx.select({ kind: matchingBookIntents.kind })
        .from(matchingBookIntents).where(and(
          eq(matchingBookIntents.sessionId, sessionId),
          eq(matchingBookIntents.userId, userId),
          eq(matchingBookIntents.bookId, bookId),
        )).limit(1)
      if (intent?.kind === 'hard') throw new MatchingTransitionError('book_action_forbidden')
      if (intent?.kind === 'conditional') {
        await this.tx.delete(matchingBookIntents).where(and(
          eq(matchingBookIntents.sessionId, sessionId),
          eq(matchingBookIntents.userId, userId),
          eq(matchingBookIntents.bookId, bookId),
        ))
      }
    }

    if (statusChanged) {
      await this.tx
        .update(signupBooks)
        .set({ personalStatus: status, personalStatusUpdatedAt: new Date() })
        .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
    }

    if (status !== null) {
      const deleted = await this.tx
        .delete(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
        .returning({ bookId: bookPriorities.bookId })
      if (deleted.length === 0) return statusChanged
      const remaining = await this.tx
        .select({ bookId: bookPriorities.bookId })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
        .orderBy(asc(bookPriorities.rank))
      for (let index = 0; index < remaining.length; index++) {
        await this.tx
          .update(bookPriorities)
          .set({ rank: index + 1, updatedAt: new Date() })
          .where(and(
            eq(bookPriorities.userId, userId),
            eq(bookPriorities.bookId, remaining[index].bookId),
          ))
      }
      return true
    } else {
      // Возврат книги в матчинг: дописать auto-ранг в конец, если его нет.
      const ranked = await this.tx
        .select({ rank: bookPriorities.rank })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
      const inserted = await this.tx
        .insert(bookPriorities)
        .values({ userId, bookId, rank: nextRank(ranked.map(r => ({ bookId, rank: r.rank }))), rankSource: 'auto' })
        .onConflictDoNothing()
        .returning({ bookId: bookPriorities.bookId })
      return statusChanged || inserted.length > 0
    }
  }

  private async changeRank(userId: string, bookId: string, rank: number | null): Promise<boolean> {
    if (rank === null) {
      const deleted = await this.tx
        .delete(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, bookId)))
        .returning({ bookId: bookPriorities.bookId })
      return deleted.length > 0
    }
    await this.tx
      .insert(bookPriorities)
      .values({ userId, bookId, rank })
      .onConflictDoUpdate({
        target: [bookPriorities.userId, bookPriorities.bookId],
        set: { rank, updatedAt: new Date() },
      })
    return true
  }

  async lockCircle(
    sessionId: string,
    circle: ReconciliationCircle,
    stateVersion: number,
  ): Promise<void> {
    const circleId = randomUUID()
    await this.tx.insert(matchingLockedCircles).values({
      id: circleId,
      sessionId,
      bookId: circle.bookId,
      circleKey: circle.circleKey,
      lockedStateVersion: stateVersion,
    })

    const participantRows = await this.tx
      .select({
        userId: matchingSessionParticipants.userId,
        publicRef: matchingSessionParticipants.publicRef,
        joinedAt: matchingSessionParticipants.joinedAt,
        name: users.name,
      })
      .from(matchingSessionParticipants)
      .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
      .where(eq(matchingSessionParticipants.sessionId, sessionId))
    const displayNames = assignMatchingDisplayNames(participantRows)
    await this.tx.insert(matchingLockedCircleMembers).values(
      circle.memberUserIds.map((userId) => ({
        circleId,
        sessionId,
        userId,
        displayNameSnapshot: displayNames.get(userId) ?? 'Без имени',
      })),
    )
    await this.tx
      .delete(matchingCircleConfirmations)
      .where(and(
        eq(matchingCircleConfirmations.sessionId, sessionId),
        inArray(matchingCircleConfirmations.userId, circle.memberUserIds),
      ))
  }

  async writeEvents(sessionId: string, events: MatchingEventDraft[]): Promise<void> {
    if (events.length === 0) return
    const userIds = Array.from(new Set(events.flatMap((event) => (
      [event.actorUserId, event.subjectUserId].filter((value): value is string => Boolean(value))
    ))))
    const names = userIds.length > 0
      ? await this.tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : []
    const bookIds = Array.from(new Set(events.flatMap((event) => {
      const afterBookIds = event.after && typeof event.after === 'object' && 'bookIds' in event.after && Array.isArray(event.after.bookIds)
        ? event.after.bookIds.filter((value): value is string => typeof value === 'string')
        : []
      return [event.bookId, ...afterBookIds].filter((value): value is string => Boolean(value))
    })))
    const bookRows = bookIds.length > 0
      ? await this.tx.select({ id: books.id, title: books.title }).from(books).where(inArray(books.id, bookIds))
      : []
    const namesByUserId = new Map(names.map((row) => [row.id, row.name?.trim() || 'Без имени']))
    const rows = buildMatchingEventRows({
      sessionId,
      actor: this.actor,
      namesByUserId,
      bookTitlesById: new Map(bookRows.map((row) => [row.id, row.title])),
      events,
    })
    await this.tx.insert(matchingEvents).values(rows)
  }

  async writeNotices(sessionId: string, notices: MatchingNoticeDraft[]): Promise<void> {
    if (notices.length === 0) return
    await this.tx.insert(matchingNotices).values(notices.map((notice) => ({
      sessionId,
      userId: notice.userId,
      kind: notice.kind,
      payload: notice.payload ?? {},
    })))
  }

  async bumpStateVersion(sessionId: string): Promise<void> {
    await this.tx
      .update(matchingSessions)
      .set({ stateVersion: sql`${matchingSessions.stateVersion} + 1` })
      .where(eq(matchingSessions.id, sessionId))
  }
}

export async function runMatchingTransition(input: {
  sessionId: string
  actor: MatchingTransitionActor
  expectedStateVersion?: number
  action: MatchingAction
}): Promise<{ changed: boolean; stateVersion: number }> {
  return withAuditContext(
    {
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      source: input.actor.source,
    },
    async (tx) => executeMatchingTransition(
      input,
      new DrizzleMatchingTransitionStore(tx, input.actor),
    ),
  )
}

export { fetchRankedMatchingScenarios, toRankedReconciliationScenarios } from './reconciliation-scenarios-db'

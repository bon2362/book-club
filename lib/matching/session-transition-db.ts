import { randomUUID } from 'crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingCircleConfirmations,
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
import { buildCircleKey } from './circle-key'
import { buildMatchingEventRows } from './matching-events'
import {
  type MatchingScenario,
} from './scenarios'
import { fetchMatchingScenarioOverview } from './scenario-overview-db'
import {
  executeMatchingTransition,
  type MatchingAction,
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

export function toRankedReconciliationScenarios(
  sessionId: string,
  scenarios: MatchingScenario[],
): RankedReconciliationScenario[] {
  return scenarios.map((scenario) => ({
    circles: scenario.circles.map((circle) => {
      const memberUserIds = circle.members.map((member) => member.userId).sort()
      return {
        circleKey: buildCircleKey({ sessionId, bookId: circle.bookId, memberUserIds }),
        bookId: circle.bookId,
        memberUserIds,
      }
    }),
  }))
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
      SELECT status, state_version AS "stateVersion"
      FROM matching_sessions
      WHERE id = ${sessionId}
      FOR UPDATE
    `)
    return executeRows<{ status: string; stateVersion: number }>(result)[0] ?? null
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

    const [locked] = await this.tx
      .select({ userId: matchingLockedCircleMembers.userId })
      .from(matchingLockedCircleMembers)
      .where(and(
        eq(matchingLockedCircleMembers.sessionId, sessionId),
        eq(matchingLockedCircleMembers.userId, userId),
        isNull(matchingLockedCircleMembers.releasedAt),
      ))
      .limit(1)
    return locked ? 'observer' as const : 'active' as const
  }

  async getRankedScenarios(sessionId: string): Promise<RankedReconciliationScenario[]> {
    const overview = await fetchMatchingScenarioOverview(sessionId, this.tx)
    return toRankedReconciliationScenarios(sessionId, overview.scenarios)
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

  async applyAction(sessionId: string, action: MatchingAction): Promise<boolean> {
    switch (action.type) {
      case 'self_join':
      case 'admin_add': {
        let changed = false
        if (action.type === 'self_join' && action.name !== undefined) {
          const [current] = await this.tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, action.userId))
            .limit(1)
          if (current && current.name !== action.name) {
            await this.tx.update(users).set({ name: action.name }).where(eq(users.id, action.userId))
            changed = true
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
        return changed || inserted.length > 0
      }
      case 'leave':
      case 'admin_remove': {
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
        return this.changeBook(action.userId, action.bookId, action.operation)
      case 'change_rank':
        return this.changeRank(action.userId, action.bookId, action.rank)
      case 'change_status':
        return this.changeStatus(action.userId, action.bookId, action.status)
      case 'replace_signup':
        return this.replaceSignup(action.userId, action.name, action.contacts, action.bookIds)
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
        return true
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
        return false
    }
  }

  private async changeBook(
    userId: string,
    bookId: string,
    operation: 'add' | 'remove',
  ): Promise<boolean> {
    if (operation === 'add') {
      const inserted = await this.tx
        .insert(signupBooks)
        .values({ userId, bookId })
        .onConflictDoNothing()
        .returning({ bookId: signupBooks.bookId })
      return inserted.length > 0
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
        .values({ userId, bookId: bookIds[index], rank: index + 1 })
        .onConflictDoUpdate({
          target: [bookPriorities.userId, bookPriorities.bookId],
          set: { rank: index + 1, updatedAt: new Date() },
        })
    }
    await this.tx.update(users).set({ prioritiesSet: true }).where(eq(users.id, userId))
    return true
  }

  private async replaceSignup(
    userId: string,
    name: string,
    contacts: string,
    bookIds: string[],
  ): Promise<boolean> {
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

    if (result.addedBookIds.length > 0) {
      const retainedPriorities = await this.tx
        .select({ bookId: bookPriorities.bookId })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
      const selected = new Set(result.addedBookIds)
      const removedPriorityIds = retainedPriorities
        .map((row) => row.bookId)
        .filter((bookId) => !selected.has(bookId))
      if (removedPriorityIds.length > 0) {
        await this.tx
          .delete(bookPriorities)
          .where(and(
            eq(bookPriorities.userId, userId),
            inArray(bookPriorities.bookId, removedPriorityIds),
          ))
      }
    } else {
      await this.tx.delete(bookPriorities).where(eq(bookPriorities.userId, userId))
    }

    return profileChanged || result.newlyAddedBookIds.length > 0 || result.removedBookIds.length > 0
  }

  private async changeStatus(
    userId: string,
    bookId: string,
    status: 'reading' | 'read' | null,
  ): Promise<boolean> {
    const [signup] = await this.tx
      .select({ personalStatus: signupBooks.personalStatus })
      .from(signupBooks)
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))
      .limit(1)
    if (!signup || signup.personalStatus === status) return false

    await this.tx
      .update(signupBooks)
      .set({ personalStatus: status, personalStatusUpdatedAt: new Date() })
      .where(and(eq(signupBooks.userId, userId), eq(signupBooks.bookId, bookId)))

    if (status !== null) {
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
    }

    return true
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

export async function fetchRankedMatchingScenarios(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<RankedReconciliationScenario[]> {
  return new DrizzleMatchingTransitionStore(
    dbClient,
    { userId: null, label: null, source: 'system' },
  ).getRankedScenarios(sessionId)
}

import { randomUUID } from 'crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookPriorities,
  books,
  matchingBookAssignments,
  matchingBookIntents,
  matchingEvents,
  matchingNotices,
  matchingSessionParticipants,
  matchingSessions,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { upsertSignupByBookIds } from '@/lib/signup-books'
import { buildMatchingEventRows } from './matching-events'
import { nextRank } from './rank-assignment'
import { applyBookMatchingAction } from './book-transition-db'
import {
  executeMatchingTransition,
  MatchingTransitionError,
  type MatchingAction,
  type MatchingActionResult,
  type MatchingEventDraft,
  type MatchingNoticeDraft,
  type MatchingTransitionActor,
  type MatchingTransitionStore,
} from './session-transition'

type DbClient = typeof db

export function shouldEnforceCatalogMatchingLocks(sessionStatus: string): boolean {
  return sessionStatus !== 'closed'
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
    return executeRows<{
      status: string
      stateVersion: number
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

    const assignmentRows = await this.tx.select({ userId: matchingBookAssignments.userId })
      .from(matchingBookAssignments)
      .where(and(eq(matchingBookAssignments.sessionId, sessionId), eq(matchingBookAssignments.userId, userId)))
      .limit(1)
    return assignmentRows.length > 0 ? 'observer' as const : 'active' as const
  }

  async applyAction(
    sessionId: string,
    action: MatchingAction,
    nextStateVersion: number,
    context: { sessionStatus: string },
  ): Promise<MatchingActionResult> {
    if ([
      'set_conditional', 'unset_conditional', 'set_hard',
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

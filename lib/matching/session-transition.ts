import {
  reconcileConfirmations,
  type CircleConfirmation,
  type RankedReconciliationScenario,
  type ReconciliationCircle,
} from './confirmation-reconciliation'

export type MatchingAction =
  | { type: 'self_join'; userId: string; name?: string }
  | { type: 'admin_add'; userId: string }
  | { type: 'leave'; userId: string }
  | { type: 'admin_remove'; userId: string }
  | { type: 'set_confirmation'; userId: string; circleKey: string }
  | { type: 'cancel_confirmation'; userId: string }
  | { type: 'change_book'; userId: string; bookId: string; operation: 'add' | 'remove' }
  | { type: 'change_rank'; userId: string; bookId: string; rank: number | null }
  | { type: 'change_status'; userId: string; bookId: string; status: 'reading' | 'read' | null }
  | { type: 'replace_signup'; userId: string; name: string; contacts: string; bookIds: string[] }
  | { type: 'reorder_priorities'; userId: string; bookIds: string[] }
  | { type: 'change_group_size'; min: number; max: number }
  | { type: 'dissolve_circle'; circleId: string; reason: string }
  | { type: 'initialize_book_mode' }
  | { type: 'set_conditional'; userId: string; bookId: string }
  | { type: 'unset_conditional'; userId: string; bookId: string }
  | { type: 'set_hard'; userId: string; bookId: string }
  | { type: 'cancel_hard'; userId: string }
  | { type: 'admin_assign_book'; userId: string; bookId: string }
  | { type: 'admin_unassign_book'; userId: string }
  | { type: 'admin_create_book_circle'; bookId: string }
  | { type: 'admin_delete_book_circle'; circleId: string }
  | { type: 'admin_place_book_assignment'; userId: string; circleId: string | null }
  | { type: 'close_session' }
  | { type: 'reopen_session' }
  | { type: 'freeze' }

export type MatchingTransitionErrorCode =
  | 'session_not_found'
  | 'session_frozen'
  | 'stale_state'
  | 'participant_missing'
  | 'participant_locked'
  | 'circle_not_found'
  | 'cascade_limit'
  | 'book_mode_unavailable'
  | 'book_not_in_shortlist'
  | 'book_action_forbidden'
  | 'invalid_book_action'

export class MatchingTransitionError extends Error {
  constructor(public readonly code: MatchingTransitionErrorCode) {
    super(code)
    this.name = 'MatchingTransitionError'
  }
}

export function resolveParticipantRole(input: {
  bookModeInitialized: boolean
  hasBookAssignment: boolean
  hasLegacyLock: boolean
}): 'active' | 'observer' {
  return input.bookModeInitialized
    ? input.hasBookAssignment ? 'observer' : 'active'
    : input.hasLegacyLock ? 'observer' : 'active'
}

export interface MatchingTransitionActor {
  userId: string | null
  label: string | null
  source: string
}

export interface MatchingEventDraft {
  eventType: string
  stateVersion: number
  actorUserId?: string | null
  subjectUserId?: string | null
  bookId?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

export interface MatchingNoticeDraft {
  userId: string
  kind: string
  payload?: Record<string, unknown>
}

export type MatchingActionResult = boolean | {
  changed: boolean
  events: Omit<MatchingEventDraft, 'stateVersion'>[]
  notices?: MatchingNoticeDraft[]
}

export interface MatchingTransitionStore {
  lockSession(sessionId: string): Promise<{
    status: string
    stateVersion: number
    bookModeInitializedAt?: Date | null
  } | null>
  getParticipantRole(sessionId: string, userId: string): Promise<'missing' | 'active' | 'observer'>
  getRankedScenarios(sessionId: string): Promise<RankedReconciliationScenario[]>
  getConfirmations(sessionId: string): Promise<CircleConfirmation[]>
  getDisplayNames(sessionId: string): Promise<ReadonlyMap<string, string>>
  hasLatestConfirmationOutcome(input: {
    sessionId: string
    userId: string
    afterStateVersion: number
    throughStateVersion: number
    participantRole: 'active' | 'observer'
    outcome: 'set' | 'cancel'
    circleKey?: string
  }): Promise<boolean>
  upsertConfirmation(sessionId: string, confirmation: CircleConfirmation): Promise<void>
  deleteConfirmation(sessionId: string, userId: string): Promise<boolean>
  applyAction(sessionId: string, action: MatchingAction, nextStateVersion: number): Promise<MatchingActionResult>
  lockCircle(sessionId: string, circle: ReconciliationCircle, stateVersion: number): Promise<void>
  writeEvents(sessionId: string, events: MatchingEventDraft[]): Promise<void>
  writeNotices(sessionId: string, notices: MatchingNoticeDraft[]): Promise<void>
  bumpStateVersion(sessionId: string): Promise<void>
}

function participantUserId(action: MatchingAction): string | null {
  switch (action.type) {
    case 'self_join':
    case 'admin_add':
    case 'leave':
    case 'admin_remove':
    case 'set_confirmation':
    case 'cancel_confirmation':
    case 'change_book':
    case 'change_rank':
    case 'change_status':
    case 'replace_signup':
    case 'reorder_priorities':
    case 'set_conditional':
    case 'unset_conditional':
    case 'set_hard':
    case 'cancel_hard':
    case 'admin_assign_book':
    case 'admin_unassign_book':
    case 'admin_place_book_assignment':
      return action.userId
    case 'change_group_size':
    case 'dissolve_circle':
    case 'initialize_book_mode':
    case 'admin_create_book_circle':
    case 'admin_delete_book_circle':
    case 'close_session':
    case 'reopen_session':
    case 'freeze':
      return null
  }
}

function requiresActiveParticipant(action: MatchingAction): boolean {
  return ![
    'self_join',
    'admin_add',
    'change_book',
    'change_rank',
    'change_status',
    'replace_signup',
    'reorder_priorities',
    'change_group_size',
    'dissolve_circle',
    'initialize_book_mode',
    'admin_assign_book',
    'admin_unassign_book',
    'admin_create_book_circle',
    'admin_delete_book_circle',
    'admin_place_book_assignment',
    'close_session',
    'reopen_session',
    'freeze',
  ].includes(action.type)
}

function actionEventDraft(
  action: MatchingAction,
  stateVersion: number,
  actorUserId: string | null,
): MatchingEventDraft {
  const base: MatchingEventDraft = {
    eventType: action.type,
    stateVersion,
    actorUserId,
    subjectUserId: participantUserId(action),
  }

  switch (action.type) {
    case 'change_book':
      return { ...base, bookId: action.bookId, metadata: { operation: action.operation } }
    case 'change_rank':
      return { ...base, bookId: action.bookId, after: { rank: action.rank } }
    case 'change_status':
      return { ...base, bookId: action.bookId, after: { status: action.status } }
    case 'replace_signup':
      return { ...base, after: { bookIds: action.bookIds, name: action.name } }
    case 'reorder_priorities':
      return { ...base, after: { bookIds: action.bookIds } }
    case 'change_group_size':
      return { ...base, after: { minGroupSize: action.min, maxGroupSize: action.max } }
    case 'dissolve_circle':
      return { ...base, eventType: 'circle_dissolved', metadata: { reason: action.reason, circleId: action.circleId } }
    case 'set_conditional':
    case 'unset_conditional':
    case 'set_hard':
      return { ...base, bookId: action.bookId }
    case 'admin_assign_book':
      return { ...base, bookId: action.bookId }
    case 'admin_create_book_circle':
      return { ...base, bookId: action.bookId }
    case 'admin_delete_book_circle':
      return { ...base, metadata: { circleId: action.circleId } }
    case 'admin_place_book_assignment':
      return { ...base, metadata: { circleId: action.circleId } }
    case 'self_join':
      return { ...base, after: action.name === undefined ? null : { name: action.name } }
    case 'admin_add':
    case 'leave':
    case 'admin_remove':
    case 'freeze':
    case 'set_confirmation':
    case 'cancel_confirmation':
    case 'cancel_hard':
    case 'admin_unassign_book':
    case 'initialize_book_mode':
    case 'close_session':
    case 'reopen_session':
      return base
  }
}

function findCircle(
  scenarios: RankedReconciliationScenario[],
  circleKey: string,
  userId: string,
): ReconciliationCircle | null {
  for (const scenario of scenarios) {
    const circle = scenario.circles.find((item) => (
      item.circleKey === circleKey && item.memberUserIds.includes(userId)
    ))
    if (circle) return circle
  }
  return null
}

async function reconcileUntilStable(input: {
  sessionId: string
  nextStateVersion: number
  store: MatchingTransitionStore
  events: MatchingEventDraft[]
  notices: MatchingNoticeDraft[]
  preActionDisplayNames: ReadonlyMap<string, string>
  postActionDisplayNames: ReadonlyMap<string, string>
}): Promise<void> {
  for (let iteration = 0; iteration < 100; iteration++) {
    const [rankedScenarios, confirmations] = await Promise.all([
      input.store.getRankedScenarios(input.sessionId),
      input.store.getConfirmations(input.sessionId),
    ])
    const reconciled = reconcileConfirmations({
      rankedScenarios,
      confirmations,
      lockedMemberUserIds: new Set(),
    })

    for (const transfer of reconciled.transfers) {
      await input.store.upsertConfirmation(input.sessionId, {
        userId: transfer.userId,
        bookId: transfer.bookId,
        circleKey: transfer.toCircleKey,
        memberUserIds: transfer.toMemberUserIds,
      })
      input.events.push({
        eventType: 'confirmation_transferred',
        stateVersion: input.nextStateVersion,
        subjectUserId: transfer.userId,
        bookId: transfer.bookId,
        before: { circleKey: transfer.fromCircleKey, memberUserIds: transfer.fromMemberUserIds },
        after: { circleKey: transfer.toCircleKey, memberUserIds: transfer.toMemberUserIds },
        metadata: { automatic: true },
      })
      input.notices.push({
        userId: transfer.userId,
        kind: 'confirmation_transferred',
        payload: {
          ...transfer,
          fromMemberDisplayNames: transfer.fromMemberUserIds.map((id) => input.preActionDisplayNames.get(id) ?? 'Без имени'),
          toMemberDisplayNames: transfer.toMemberUserIds.map((id) => input.postActionDisplayNames.get(id) ?? 'Без имени'),
        },
      })
    }

    for (const invalidation of reconciled.invalidations) {
      await input.store.deleteConfirmation(input.sessionId, invalidation.userId)
      input.events.push({
        eventType: 'confirmation_invalidated',
        stateVersion: input.nextStateVersion,
        subjectUserId: invalidation.userId,
        bookId: invalidation.bookId,
        before: invalidation,
        after: null,
        metadata: { automatic: true },
      })
      input.notices.push({
        userId: invalidation.userId,
        kind: 'confirmation_invalidated',
        payload: {
          ...invalidation,
          memberDisplayNames: invalidation.memberUserIds.map((id) => input.preActionDisplayNames.get(id) ?? 'Без имени'),
        },
      })
    }

    const circle = reconciled.circlesToLock[0]
    if (!circle) return

    await input.store.lockCircle(input.sessionId, circle, input.nextStateVersion)
    input.events.push({
      eventType: 'circle_locked',
      stateVersion: input.nextStateVersion,
      bookId: circle.bookId,
      after: circle,
      metadata: { automatic: true },
    })
    circle.memberUserIds.forEach((userId) => {
      input.notices.push({
        userId,
        kind: 'circle_locked',
        payload: { circleKey: circle.circleKey, bookId: circle.bookId },
      })
    })
  }

  throw new MatchingTransitionError('cascade_limit')
}

export async function executeMatchingTransition(
  input: {
    sessionId: string
    actor: MatchingTransitionActor
    expectedStateVersion?: number
    action: MatchingAction
  },
  store: MatchingTransitionStore,
): Promise<{ changed: boolean; stateVersion: number }> {
  const session = await store.lockSession(input.sessionId)
  if (!session) throw new MatchingTransitionError('session_not_found')
  const action = input.action
  const canonicalBookAction = [
    'set_conditional', 'unset_conditional', 'set_hard', 'cancel_hard',
    'admin_assign_book', 'admin_unassign_book', 'admin_create_book_circle',
    'admin_delete_book_circle', 'admin_place_book_assignment',
  ].includes(action.type)
  const sharedBookAction = Boolean(session.bookModeInitializedAt) && [
    'self_join', 'admin_add', 'leave', 'admin_remove', 'change_book',
    'change_rank', 'change_status', 'replace_signup', 'reorder_priorities',
  ].includes(action.type)
  const catalogBookAction = [
    'change_book', 'change_rank', 'change_status', 'replace_signup', 'reorder_priorities',
  ].includes(action.type)
  const bookAction = canonicalBookAction || sharedBookAction
  const adminBookAction = action.type.startsWith('admin_') || (input.actor.source === 'admin' && sharedBookAction)
  const lifecycleAction = ['close_session', 'reopen_session'].includes(action.type)
  if (action.type === 'initialize_book_mode') {
    if (session.bookModeInitializedAt) return { changed: false, stateVersion: session.stateVersion }
  } else if (bookAction || lifecycleAction) {
    if (!session.bookModeInitializedAt) throw new MatchingTransitionError('book_mode_unavailable')
    const closedCatalogMutation = session.status === 'closed' && catalogBookAction
    if (!adminBookAction && !lifecycleAction && session.status !== 'open' && !closedCatalogMutation) {
      throw new MatchingTransitionError('session_frozen')
    }
  } else {
    if (session.bookModeInitializedAt) throw new MatchingTransitionError('book_action_forbidden')
    if (session.status !== 'active') throw new MatchingTransitionError('session_frozen')
  }
  if (
    input.expectedStateVersion !== undefined &&
    input.expectedStateVersion !== session.stateVersion
  ) {
    if (
      (action.type === 'set_confirmation' || action.type === 'cancel_confirmation')
    ) {
      const participantRole = await store.getParticipantRole(input.sessionId, action.userId)
      if (participantRole !== 'missing' && await store.hasLatestConfirmationOutcome({
        sessionId: input.sessionId,
        userId: action.userId,
        afterStateVersion: input.expectedStateVersion,
        throughStateVersion: session.stateVersion,
        participantRole,
        outcome: action.type === 'set_confirmation' ? 'set' : 'cancel',
        circleKey: action.type === 'set_confirmation' ? action.circleKey : undefined,
      })) {
        return { changed: false, stateVersion: session.stateVersion }
      }
    }
    throw new MatchingTransitionError('stale_state')
  }

  const subjectUserId = participantUserId(action)
  if (subjectUserId && requiresActiveParticipant(action)) {
    const role = await store.getParticipantRole(input.sessionId, subjectUserId)
    if (role === 'missing') throw new MatchingTransitionError('participant_missing')
    if (role === 'observer') throw new MatchingTransitionError('participant_locked')
  }

  const nextStateVersion = session.stateVersion + 1
  const events: MatchingEventDraft[] = []
  const notices: MatchingNoticeDraft[] = []
  const preActionDisplayNames = await store.getDisplayNames(input.sessionId)
  let changed = false

  if (action.type === 'set_confirmation') {
    const confirmations = await store.getConfirmations(input.sessionId)
    const existing = confirmations.find((item) => item.userId === action.userId)
    if (existing?.circleKey === action.circleKey) {
      return { changed: false, stateVersion: session.stateVersion }
    }

    const scenarios = await store.getRankedScenarios(input.sessionId)
    const target = findCircle(scenarios, action.circleKey, action.userId)
    if (!target) throw new MatchingTransitionError('circle_not_found')

    await store.upsertConfirmation(input.sessionId, {
      userId: action.userId,
      bookId: target.bookId,
      circleKey: target.circleKey,
      memberUserIds: [...target.memberUserIds],
    })
    events.push({
      eventType: existing ? 'confirmation_switched' : 'confirmation_created',
      stateVersion: nextStateVersion,
      actorUserId: input.actor.userId,
      subjectUserId: action.userId,
      bookId: target.bookId,
      before: existing ?? null,
      after: target,
    })
    changed = true
  } else if (action.type === 'cancel_confirmation') {
    const confirmations = await store.getConfirmations(input.sessionId)
    const existing = confirmations.find((item) => item.userId === action.userId)
    if (!existing) return { changed: false, stateVersion: session.stateVersion }

    await store.deleteConfirmation(input.sessionId, action.userId)
    events.push({
      eventType: 'confirmation_cancelled',
      stateVersion: nextStateVersion,
      actorUserId: input.actor.userId,
      subjectUserId: action.userId,
      bookId: existing.bookId,
      before: existing,
      after: null,
    })
    changed = true
  } else {
    const applied = await store.applyAction(input.sessionId, action, nextStateVersion)
    changed = typeof applied === 'boolean' ? applied : applied.changed
    if (changed) {
      if (typeof applied !== 'boolean' && applied.events.length > 0) {
        events.push(...applied.events.map((event) => ({ ...event, stateVersion: nextStateVersion })))
      } else {
        events.push(actionEventDraft(action, nextStateVersion, input.actor.userId))
      }
      if (typeof applied !== 'boolean' && applied.notices) {
        notices.push(...applied.notices)
      }
    }
  }

  if (!changed) return { changed: false, stateVersion: session.stateVersion }
  const postActionDisplayNames = await store.getDisplayNames(input.sessionId)

  if (!bookAction && !lifecycleAction && action.type !== 'initialize_book_mode') {
    await reconcileUntilStable({
      sessionId: input.sessionId,
      nextStateVersion,
      store,
      events,
      notices,
      preActionDisplayNames,
      postActionDisplayNames,
    })
  }
  await store.writeEvents(input.sessionId, events)
  await store.writeNotices(input.sessionId, notices)
  await store.bumpStateVersion(input.sessionId)

  return { changed: true, stateVersion: nextStateVersion }
}

export type MatchingAction =
  | { type: 'self_join'; userId: string; name?: string }
  | { type: 'admin_add'; userId: string }
  | { type: 'leave'; userId: string }
  | { type: 'admin_remove'; userId: string }
  | { type: 'change_book'; userId: string; bookId: string; operation: 'add' | 'remove' }
  | { type: 'change_rank'; userId: string; bookId: string; rank: number | null }
  | { type: 'change_status'; userId: string; bookId: string; status: 'reading' | 'read' | null }
  | { type: 'replace_signup'; userId: string; name: string; contacts: string; bookIds: string[] }
  | { type: 'reorder_priorities'; userId: string; bookIds: string[] }
  | { type: 'change_group_size'; min: number; max: number }
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

export type MatchingTransitionErrorCode =
  | 'session_not_found'
  | 'session_closed'
  | 'stale_state'
  | 'participant_missing'
  | 'participant_locked'
  | 'circle_not_found'
  | 'book_not_in_shortlist'
  | 'book_action_forbidden'
  | 'invalid_book_action'

export class MatchingTransitionError extends Error {
  constructor(public readonly code: MatchingTransitionErrorCode) {
    super(code)
    this.name = 'MatchingTransitionError'
  }
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
  lockSession(sessionId: string): Promise<{ status: string; stateVersion: number } | null>
  getParticipantRole(sessionId: string, userId: string): Promise<'missing' | 'active' | 'observer'>
  applyAction(
    sessionId: string,
    action: MatchingAction,
    nextStateVersion: number,
    context: { sessionStatus: string },
  ): Promise<MatchingActionResult>
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
    case 'admin_create_book_circle':
    case 'admin_delete_book_circle':
    case 'close_session':
    case 'reopen_session':
      return null
  }
}

function requiresActiveParticipant(action: MatchingAction): boolean {
  return ![
    'self_join', 'admin_add', 'replace_signup', 'reorder_priorities',
    'change_group_size', 'admin_assign_book', 'admin_unassign_book',
    'admin_create_book_circle', 'admin_delete_book_circle',
    'admin_place_book_assignment', 'close_session', 'reopen_session',
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
    case 'change_book': return { ...base, bookId: action.bookId, metadata: { operation: action.operation } }
    case 'change_rank': return { ...base, bookId: action.bookId, after: { rank: action.rank } }
    case 'change_status': return { ...base, bookId: action.bookId, after: { status: action.status } }
    case 'replace_signup': return { ...base, after: { bookIds: action.bookIds, name: action.name } }
    case 'reorder_priorities': return { ...base, after: { bookIds: action.bookIds } }
    case 'change_group_size': return { ...base, after: { minGroupSize: action.min, maxGroupSize: action.max } }
    case 'set_conditional':
    case 'unset_conditional':
    case 'set_hard':
    case 'admin_assign_book':
    case 'admin_create_book_circle': return { ...base, bookId: action.bookId }
    case 'admin_delete_book_circle': return { ...base, metadata: { circleId: action.circleId } }
    case 'admin_place_book_assignment': return { ...base, metadata: { circleId: action.circleId } }
    case 'self_join': return { ...base, after: action.name === undefined ? null : { name: action.name } }
    default: return base
  }
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
  const sessionStatus = normalizeMatchingSessionStatus(session.status)

  const historicalCatalogMutation = [
    'change_book', 'change_rank', 'change_status',
  ].includes(input.action.type) && sessionStatus === 'closed'
  const lifecycleAction = ['close_session', 'reopen_session'].includes(input.action.type)
  if (!historicalCatalogMutation && !lifecycleAction && sessionStatus !== 'open') {
    throw new MatchingTransitionError('session_closed')
  }
  if (input.expectedStateVersion !== undefined && input.expectedStateVersion !== session.stateVersion) {
    throw new MatchingTransitionError('stale_state')
  }

  const subjectUserId = participantUserId(input.action)
  if (subjectUserId && requiresActiveParticipant(input.action) && !historicalCatalogMutation) {
    const role = await store.getParticipantRole(input.sessionId, subjectUserId)
    if (role === 'missing') throw new MatchingTransitionError('participant_missing')
    if (role === 'observer') throw new MatchingTransitionError('participant_locked')
  }

  const nextStateVersion = session.stateVersion + 1
  const applied = await store.applyAction(input.sessionId, input.action, nextStateVersion, {
    sessionStatus,
  })
  const changed = typeof applied === 'boolean' ? applied : applied.changed
  if (!changed) return { changed: false, stateVersion: session.stateVersion }
  if (historicalCatalogMutation) return { changed: true, stateVersion: session.stateVersion }

  const events = typeof applied !== 'boolean' && applied.events.length > 0
    ? applied.events.map((event) => ({ ...event, stateVersion: nextStateVersion }))
    : [actionEventDraft(input.action, nextStateVersion, input.actor.userId)]
  const notices = typeof applied !== 'boolean' ? applied.notices ?? [] : []
  await store.writeEvents(input.sessionId, events)
  await store.writeNotices(input.sessionId, notices)
  await store.bumpStateVersion(input.sessionId)
  return { changed: true, stateVersion: nextStateVersion }
}
import { normalizeMatchingSessionStatus } from './session-status'

import type {
  MatchingEventDraft,
  MatchingTransitionActor,
} from './session-transition'

export interface MatchingEventInsert {
  sessionId: string
  eventType: string
  actorUserId: string | null
  actorNameSnapshot: string | null
  subjectUserId: string | null
  subjectNameSnapshot: string | null
  source: string
  bookId: string | null
  before: unknown
  after: unknown
  metadata: Record<string, unknown> | null
  stateVersion: number
}

export function buildMatchingEventRows(input: {
  sessionId: string
  actor: MatchingTransitionActor
  namesByUserId: ReadonlyMap<string, string>
  events: MatchingEventDraft[]
}): MatchingEventInsert[] {
  return input.events.map((event) => {
    const hasExplicitActor = Object.prototype.hasOwnProperty.call(event, 'actorUserId')
    const actorUserId = hasExplicitActor ? event.actorUserId ?? null : input.actor.userId
    const actorNameSnapshot = actorUserId === input.actor.userId
      ? input.actor.label
      : actorUserId ? input.namesByUserId.get(actorUserId) ?? null : null
    const subjectUserId = event.subjectUserId ?? null

    return {
      sessionId: input.sessionId,
      eventType: event.eventType,
      actorUserId,
      actorNameSnapshot,
      subjectUserId,
      subjectNameSnapshot: subjectUserId
        ? input.namesByUserId.get(subjectUserId) ?? null
        : null,
      source: input.actor.source,
      bookId: event.bookId ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      metadata: event.metadata ?? null,
      stateVersion: event.stateVersion,
    }
  })
}

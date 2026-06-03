import type { MatchingMutationKind } from './feed-events'
import type { MatchingScenarioContext } from './scenario-input'
import { buildFeedEventsForMutation } from './feed-events'
import { clearAdriftCause, rememberAdriftCausesFromEvents } from './adrift'
import { fetchScenarioContextForSession } from './scenario-input'
import { recordMatchingPreferenceEvent } from './preference-events'

export interface MatchingMutationSnapshot {
  context: MatchingScenarioContext
}

export interface FinalizeMatchingMutationInput {
  sessionId: string
  targetUserId: string
  actorUserId: string
  bookId: string | null
  kind: MatchingMutationKind
  source: 'matching' | 'catalog' | 'profile' | 'admin'
  before: MatchingMutationSnapshot | null
  metadata?: Record<string, unknown>
}

export async function captureMatchingMutationSnapshot(
  sessionId: string,
): Promise<MatchingMutationSnapshot | null> {
  const context = await fetchScenarioContextForSession(sessionId)
  return context ? { context } : null
}

export async function finalizeMatchingMutationEffects({
  sessionId,
  targetUserId,
  actorUserId,
  bookId,
  kind,
  source,
  before,
  metadata = {},
}: FinalizeMatchingMutationInput): Promise<void> {
  const after = await captureMatchingMutationSnapshot(sessionId)
  if (!after) return

  const actor = after.context.participants.find((participant) => participant.userId === actorUserId)
    ?? before?.context.participants.find((participant) => participant.userId === actorUserId)
    ?? after.context.participants.find((participant) => participant.userId === targetUserId)
    ?? before?.context.participants.find((participant) => participant.userId === targetUserId)

  const effectiveBookId = bookId ?? ''
  const feedEvents = effectiveBookId && actor
    ? buildFeedEventsForMutation({
        actor,
        bookId: effectiveBookId,
        kind,
        leaderBefore: before?.context.overview.leader ?? null,
        leaderAfter: after.context.overview.leader,
      })
    : []

  rememberAdriftCausesFromEvents(sessionId, feedEvents.filter((event) => event.type === 'leftout'))

  const leftOutAfter = new Set(after.context.overview.leader?.leftOut.map((participant) => participant.userId) ?? [])
  for (const participant of after.context.participants) {
    if (!leftOutAfter.has(participant.userId)) clearAdriftCause(sessionId, participant.userId)
  }

  await recordMatchingPreferenceEvent({
    sessionId,
    userId: targetUserId,
    actorUserId,
    eventType: kind,
    source,
    bookId,
    before: before?.context.overview.leader ?? null,
    after: after.context.overview.leader,
    metadata: {
      ...metadata,
      bookTitle: bookId ? after.context.bookTitleById.get(bookId) ?? null : null,
    },
  })
}

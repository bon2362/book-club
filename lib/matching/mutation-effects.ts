import type { MatchingMutationKind } from './feed-events'
import type { MatchingScenarioContext } from './scenario-input'
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

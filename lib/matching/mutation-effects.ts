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
  source: 'matching' | 'matching_priority_gate' | 'catalog' | 'profile' | 'admin'
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

  const titleFor = (id: string) => after.context.bookTitleById.get(id) ?? id

  // Enrich any book-id arrays in metadata with human-readable titles so the
  // admin UI can show *which* books were touched without its own id→title map.
  const idArrayKeys: Array<[idKey: string, titleKey: string]> = [
    ['addedBookIds', 'addedBookTitles'],
    ['removedBookIds', 'removedBookTitles'],
    ['rankedBookIds', 'rankedBookTitles'],
  ]
  const enrichedMetadata: Record<string, unknown> = { ...metadata }
  for (const [idKey, titleKey] of idArrayKeys) {
    const ids = metadata[idKey]
    if (Array.isArray(ids)) {
      enrichedMetadata[titleKey] = (ids as string[]).map(titleFor)
    }
  }
  enrichedMetadata.bookTitle = bookId ? after.context.bookTitleById.get(bookId) ?? null : null

  await recordMatchingPreferenceEvent({
    sessionId,
    userId: targetUserId,
    actorUserId,
    eventType: kind,
    source,
    bookId,
    before: before?.context.overview.leader ?? null,
    after: after.context.overview.leader,
    metadata: enrichedMetadata,
  })
}

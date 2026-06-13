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
  /** Если true — пропускает проверку членства при записи события (нужно для participant_left). */
  skipMembershipGuard?: boolean
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
  skipMembershipGuard,
}: FinalizeMatchingMutationInput): Promise<void> {
  const after = await captureMatchingMutationSnapshot(sessionId)
  if (!after) return

  // Resolve a book title preferring the after-snapshot, then falling back to the
  // before-snapshot. Crucial for `book_removed`: if no other participant still
  // holds the removed book, it's already gone from the after-context map, so
  // without the before-fallback the title would resolve to null/id and the admin
  // preference-events viewer would show no title for solo removals.
  const resolveTitle = (id: string): string | undefined =>
    after.context.bookTitleById.get(id) ?? before?.context.bookTitleById.get(id)

  const titleFor = (id: string) => resolveTitle(id) ?? id

  // Enrich any book-id arrays in metadata with human-readable titles so the
  // admin UI can show *which* books were touched without its own id→title map.
  const idArrayKeys: Array<[idKey: string, titleKey: string]> = [
    ['addedBookIds', 'addedBookTitles'],
    ['removedBookIds', 'removedBookTitles'],
    ['rankedBookIds', 'rankedBookTitles'],
    ['previousRankedBookIds', 'previousRankedBookTitles'],
  ]
  const enrichedMetadata: Record<string, unknown> = { ...metadata }
  for (const [idKey, titleKey] of idArrayKeys) {
    const ids = metadata[idKey]
    if (Array.isArray(ids)) {
      enrichedMetadata[titleKey] = (ids as string[]).map(titleFor)
    }
  }
  enrichedMetadata.bookTitle = bookId ? resolveTitle(bookId) ?? null : null

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
    skipMembershipGuard,
  })
}

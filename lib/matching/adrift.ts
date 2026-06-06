import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingPreferenceEvents, matchingSessionParticipants } from '@/lib/db/schema'
import { asMatchingScenario, isMatchingMutationKind } from './feed-events'
import type { AdriftCause } from './feed-events'
import type { ScenarioSetOverview } from './scenarios'

/** How many events to scan when searching for the adrift cause */
const SEARCH_LIMIT = 200

/**
 * Reads matching_preference_events to find the most recent event that caused
 * userId to appear in the leader's leftOut list for the first time.
 * Returns null if no such event is found.
 *
 * Only call this when isViewerAdrift() has already confirmed the user is adrift.
 */
export async function fetchAdriftCauseForUser(
  sessionId: string,
  userId: string,
  dbClient: typeof db = db,
): Promise<AdriftCause | null> {
  const rows = await dbClient
    .select({
      actorUserId: matchingPreferenceEvents.actorUserId,
      eventType: matchingPreferenceEvents.eventType,
      bookId: matchingPreferenceEvents.bookId,
      before: matchingPreferenceEvents.before,
      after: matchingPreferenceEvents.after,
      occurredAt: matchingPreferenceEvents.occurredAt,
    })
    .from(matchingPreferenceEvents)
    .where(eq(matchingPreferenceEvents.sessionId, sessionId))
    .orderBy(desc(matchingPreferenceEvents.occurredAt))
    .limit(SEARCH_LIMIT)

  // Walk newest-to-oldest: find the transition "not in leftOut → in leftOut"
  for (const row of rows) {
    const after = asMatchingScenario(row.after)
    const before = asMatchingScenario(row.before)

    const inAfterLeftOut = after?.leftOut.some((p) => p.userId === userId) ?? false
    const inBeforeLeftOut = before?.leftOut.some((p) => p.userId === userId) ?? false

    if (inAfterLeftOut && !inBeforeLeftOut) {
      // Found the event that caused the user to become left out
      if (!isMatchingMutationKind(row.eventType)) continue

      const [participant] = await dbClient
        .select({ pseudonym: matchingSessionParticipants.pseudonym })
        .from(matchingSessionParticipants)
        .where(
          and(
            eq(matchingSessionParticipants.sessionId, sessionId),
            eq(matchingSessionParticipants.userId, row.actorUserId),
          ),
        )
        .limit(1)

      return {
        actor: {
          userId: row.actorUserId,
          pseudonym: participant?.pseudonym ?? 'Участник',
        },
        bookId: row.bookId ?? '',
        mutationKind: row.eventType,
        leaderBeforeId: before?.id ?? null,
        leaderAfterId: after?.id ?? null,
        at: row.occurredAt.getTime(),
      }
    }

    // Recovery event: user was in leftOut but recovered — stop searching
    if (!inAfterLeftOut && inBeforeLeftOut) break
  }

  return null
}

/** Returns true when the viewer has no suitable circle in the current mode. */
export function isViewerAdrift(overview: ScenarioSetOverview, viewingUserId: string): boolean {
  if (overview.mode === 'satisfaction') {
    if (overview.scenarios.length === 0) return false
    return !overview.scenarios.some((scenario) => (
      scenario.circles.some((circle) => (
        circle.members.some((member) => member.userId === viewingUserId)
      ))
    ))
  }

  const leader = overview.leader
  return !!leader && leader.leftOut.some((participant) => participant.userId === viewingUserId)
}

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingPreferenceEvents, matchingSessionParticipants } from '@/lib/db/schema'
import {
  buildFeedEventsForMutation,
  type MatchingMutationKind,
} from '../feed-events'
import type { MatchingScenario } from '../scenarios'

export type FeedEventType = 'best' | 'leftout'

export interface PublicFeedActor {
  pseudonym: string
}

export interface PublicFeedScenarioSummary {
  coveredCount: number
  totalCount: number
  strongInterestCount: number
}

interface PublicFeedEventBase {
  id: number
  ts: number
  actor: PublicFeedActor
  bookId: string
  mutationKind: MatchingMutationKind
}

export interface PublicBestFeedEvent extends PublicFeedEventBase {
  type: 'best'
  before: PublicFeedScenarioSummary | null
  after: PublicFeedScenarioSummary | null
}

export interface PublicLeftoutFeedEvent extends PublicFeedEventBase {
  type: 'leftout'
  affected: PublicFeedActor
}

export type FeedEvent = PublicBestFeedEvent | PublicLeftoutFeedEvent

const BUFFER_SIZE = 100

export async function fetchFeedForSession(
  sessionId: string,
  limit = BUFFER_SIZE,
  dbClient: typeof db = db,
): Promise<FeedEvent[]> {
  const rows = await dbClient
    .select({
      id: matchingPreferenceEvents.id,
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
    .limit(limit)

  if (rows.length === 0) return []

  const actorIds = Array.from(new Set(rows.map((row) => row.actorUserId)))
  const participants = actorIds.length > 0
    ? await dbClient
      .select({
        userId: matchingSessionParticipants.userId,
        pseudonym: matchingSessionParticipants.pseudonym,
      })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, sessionId),
          inArray(matchingSessionParticipants.userId, actorIds),
        ),
      )
    : []
  const pseudonymByUserId = new Map(participants.map((participant) => [participant.userId, participant.pseudonym]))

  let id = 0
  const persistentEvents = [...rows].reverse().flatMap((row) => {
    if (!row.bookId || !isMatchingMutationKind(row.eventType)) return []

    const drafts = buildFeedEventsForMutation({
      actor: {
        userId: row.actorUserId,
        pseudonym: pseudonymByUserId.get(row.actorUserId) ?? 'Участник',
      },
      bookId: row.bookId,
      kind: row.eventType,
      leaderBefore: asMatchingScenario(row.before),
      leaderAfter: asMatchingScenario(row.after),
      now: row.occurredAt.getTime(),
    })

    return drafts.map((draft): FeedEvent => {
      const base = {
        id: ++id,
        ts: row.occurredAt.getTime(),
        actor: { pseudonym: draft.actor.pseudonym },
        bookId: draft.bookId,
        mutationKind: draft.mutationKind,
      }

      if (draft.type === 'best') {
        return {
          ...base,
          type: 'best',
          before: toPublicSummary(draft.before),
          after: toPublicSummary(draft.after),
        }
      }

      return {
        ...base,
        type: 'leftout',
        affected: { pseudonym: draft.affected.pseudonym },
      }
    })
  })

  return persistentEvents.slice(-limit)
}

function isMatchingMutationKind(value: string): value is MatchingMutationKind {
  return [
    'book_added',
    'book_removed',
    'rank_changed',
    'status_changed',
    'catalog_signup_updated',
    'priorities_updated',
  ].includes(value)
}

function asMatchingScenario(value: unknown): MatchingScenario | null {
  if (!value || typeof value !== 'object') return null
  return value as MatchingScenario
}

function toPublicSummary(summary: {
  coveredCount: number
  totalCount: number
  strongInterestCount: number
} | null): PublicFeedScenarioSummary | null {
  if (!summary) return null
  return {
    coveredCount: summary.coveredCount,
    totalCount: summary.totalCount,
    strongInterestCount: summary.strongInterestCount,
  }
}

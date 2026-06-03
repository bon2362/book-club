import { and, eq, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  matchingPreferenceEvents,
  matchingSessionParticipants,
} from '@/lib/db/schema'

type DbClient = typeof db

export interface RecordMatchingPreferenceEventInput {
  sessionId: string
  userId: string
  actorUserId: string
  eventType: string
  source: string
  bookId?: string | null
  before?: unknown
  after?: unknown
  metadata?: unknown
  occurredAt?: Date
}

export type RecordMatchingPreferenceEventResult =
  | { recorded: true; eventId: string }
  | { recorded: false; reason: 'not_participant_after_joined_at' }

export async function recordMatchingPreferenceEvent(
  input: RecordMatchingPreferenceEventInput,
  dbClient: DbClient = db,
): Promise<RecordMatchingPreferenceEventResult> {
  const occurredAt = input.occurredAt ?? new Date()

  const [participant] = await dbClient
    .select({ joinedAt: matchingSessionParticipants.joinedAt })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, input.sessionId),
        eq(matchingSessionParticipants.userId, input.userId),
        lte(matchingSessionParticipants.joinedAt, occurredAt),
      ),
    )
    .limit(1)

  if (!participant) {
    return { recorded: false, reason: 'not_participant_after_joined_at' }
  }

  const [created] = await dbClient
    .insert(matchingPreferenceEvents)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      source: input.source,
      bookId: input.bookId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      occurredAt,
    })
    .returning({ id: matchingPreferenceEvents.id })

  return { recorded: true, eventId: created.id }
}

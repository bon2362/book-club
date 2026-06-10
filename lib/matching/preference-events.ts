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
  /** Если true — пропускает проверку членства в сессии (нужно для participant_left: строка уже удалена). */
  skipMembershipGuard?: boolean
}

export type RecordMatchingPreferenceEventResult =
  | { recorded: true; eventId: string }
  | { recorded: false; reason: 'not_participant_after_joined_at' }

export async function recordMatchingPreferenceEvent(
  input: RecordMatchingPreferenceEventInput,
  dbClient: DbClient = db,
): Promise<RecordMatchingPreferenceEventResult> {
  const occurredAt = input.occurredAt ?? new Date()

  if (!input.skipMembershipGuard) {
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

export interface RecordParticipantLeftEventInput {
  sessionId: string
  userId: string
  actorUserId: string
  source: 'matching' | 'admin'
}

/**
 * Persists a `participant_left` analytics event. MUST be called BEFORE the
 * participant row is deleted — it snapshots the pseudonym (lost on delete) and
 * relies on the row still existing to pass the membership guard.
 */
export async function recordParticipantLeftEvent(
  input: RecordParticipantLeftEventInput,
  dbClient: DbClient = db,
): Promise<void> {
  const [participant] = await dbClient
    .select({ pseudonym: matchingSessionParticipants.pseudonym })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, input.sessionId),
        eq(matchingSessionParticipants.userId, input.userId),
      ),
    )
    .limit(1)

  if (!participant) return

  await recordMatchingPreferenceEvent(
    {
      sessionId: input.sessionId,
      userId: input.userId,
      actorUserId: input.actorUserId,
      eventType: 'participant_left',
      source: input.source,
      metadata: { pseudonym: participant.pseudonym },
    },
    dbClient,
  )
}

import { createHash } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userActivityEvents, users } from '@/lib/db/schema'

export const USER_ACTIVITY_TYPES = [
  'user_created',
  'site_visit',
  'sign_in',
  'profile_submitted',
  'profile_updated',
  'books_selected',
  'priorities_updated',
  'submission_created',
  'feedback_created',
  'sheets_import',
] as const

export type UserActivityType = typeof USER_ACTIVITY_TYPES[number]
export type UserActivitySource = 'auth' | 'api' | 'google_sheets' | 'backfill' | 'test'
export type UserActivityMetadataValue =
  | string
  | number
  | boolean
  | null
  | UserActivityMetadataValue[]
  | { [key: string]: UserActivityMetadataValue }
export type UserActivityMetadata = Record<string, UserActivityMetadataValue>

export interface RecordUserActivityOptions {
  occurredAt?: Date
  source?: UserActivitySource
  sourceId?: string
  dedupeKey?: string
  metadata?: UserActivityMetadata
}

export function buildUserActivityDedupeKey(parts: Array<string | number | boolean | null | undefined>): string {
  const value = parts.map(part => part === null || part === undefined ? '' : String(part)).join(':')
  return createHash('sha256').update(value).digest('hex')
}

// Postgres SQLSTATE for foreign_key_violation.
// Raised when we try to insert an activity event for a user that was deleted
// between resolving the userId and this INSERT — typically a parallel-test
// race (admin-delete-user vs another spec writing a sign_in event). It's not
// a real error: the user is gone, the activity has no owner. Silent no-op.
const FK_VIOLATION_SQLSTATE = '23503'

function isForeignKeyViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === FK_VIOLATION_SQLSTATE) return true
  // Drizzle/postgres-js wrap original errors — peek at .cause / .original
  const cause = (err as { cause?: unknown }).cause
  if (cause && typeof cause === 'object' && (cause as { code?: unknown }).code === FK_VIOLATION_SQLSTATE) return true
  return false
}

export async function recordUserActivity(
  userId: string,
  type: UserActivityType,
  options: RecordUserActivityOptions = {}
): Promise<void> {
  const occurredAt = options.occurredAt ?? new Date()

  let inserted: { id: string }[]
  try {
    inserted = await db
      .insert(userActivityEvents)
      .values({
        userId,
        type,
        occurredAt,
        source: options.source ?? null,
        sourceId: options.sourceId ?? null,
        dedupeKey: options.dedupeKey ?? null,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
      })
      .onConflictDoNothing({ target: userActivityEvents.dedupeKey })
      .returning({ id: userActivityEvents.id })
  } catch (err) {
    if (isForeignKeyViolation(err)) return // user vanished — nothing to record
    throw err
  }

  if (inserted.length > 0) {
    await updateUserActivityCache(userId, occurredAt)
  }
}

export async function bestEffortRecordUserActivity(
  userId: string,
  type: UserActivityType,
  options: RecordUserActivityOptions = {}
): Promise<void> {
  try {
    await recordUserActivity(userId, type, options)
  } catch (error) {
    console.error('Failed to record user activity:', error)
  }
}

export async function updateUserActivityCache(userId: string, occurredAt: Date): Promise<void> {
  await db
    .update(users)
    .set({
      lastActivityAt: sql`case when ${users.lastActivityAt} is null or ${users.lastActivityAt} < ${occurredAt} then ${occurredAt} else ${users.lastActivityAt} end`,
    })
    .where(eq(users.id, userId))
}

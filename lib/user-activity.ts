import { createHash } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userActivityEvents, users } from '@/lib/db/schema'

export const USER_ACTIVITY_TYPES = [
  'user_created',
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

export async function recordUserActivity(
  userId: string,
  type: UserActivityType,
  options: RecordUserActivityOptions = {}
): Promise<void> {
  const occurredAt = options.occurredAt ?? new Date()

  const inserted = await db
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

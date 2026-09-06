import { captureServerEvent } from '@/lib/posthog-server'

/**
 * Thin, purpose-built wrapper around `lib/posthog-server.ts` for "book choice"
 * events (see docs/planning-artifacts/2026-09-06-posthog-personalization-plan.md,
 * этап 2). Keeps event names/property shapes in one place and adds a second
 * best-effort guard on top of `captureServerEvent` (which already swallows
 * its own errors): a bug in this file itself (e.g. a null property access
 * while shaping properties) must still never break priorities, availability,
 * or meeting scheduling.
 *
 * CRITICAL: callers must invoke these functions only after their DB
 * transaction has committed. A PostHog capture is a network call — firing it
 * from inside an open Postgres transaction would hold that transaction open
 * for the duration of the HTTP request to PostHog.
 */

export async function trackPrioritiesUpdated(userId: string, count: number): Promise<void> {
  try {
    await captureServerEvent(userId, 'priorities_updated', { count })
  } catch (error) {
    console.error('[book-analytics] trackPrioritiesUpdated failed', error)
  }
}

export async function trackCalendarSlotsMarked(
  userId: string,
  slotCount: number,
  circleId?: string | null,
): Promise<void> {
  try {
    await captureServerEvent(userId, 'calendar_slots_marked', {
      slot_count: slotCount,
      circle_id: circleId ?? null,
    })
  } catch (error) {
    console.error('[book-analytics] trackCalendarSlotsMarked failed', error)
  }
}

export async function trackCircleMeetingScheduled(
  userId: string,
  circleId: string,
  markedParticipantsCount?: number | null,
): Promise<void> {
  try {
    await captureServerEvent(userId, 'circle_meeting_scheduled', {
      circle_id: circleId,
      marked_participants_count: markedParticipantsCount ?? null,
    })
  } catch (error) {
    console.error('[book-analytics] trackCircleMeetingScheduled failed', error)
  }
}

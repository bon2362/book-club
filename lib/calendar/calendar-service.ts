import { and, eq, gte, lt } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { trackCircleMeetingScheduled } from '@/lib/book-analytics'
import { db } from '@/lib/db'
import { circleMeetings, userAvailability } from '@/lib/db/schema'
import { clampToWindow, normalize } from './availability-intervals'
import { computeOverlap } from './overlap'
import { fetchCalendarPublicState } from './public-state'
import { isSlotAligned, slotKey, windowBounds, type Interval } from './slots'
import { resolveScheduleBySlug } from './schedule-db'
import type { CalendarActor } from './calendar-actor'

export class TelegramCalendarServiceError extends Error {
  constructor(public readonly code: 'not_a_member' | 'invalid_intervals' | 'invalid_interval' | 'unaligned_interval') { super(code) }
}

export async function fetchCalendarStateForActor({ actor, slug }: { actor: CalendarActor; slug: string }) {
  const state = await fetchCalendarPublicState({ slug, viewerUserId: actor.userId, isAdmin: actor.isAdmin })
  if (!state.viewer.canEdit) throw new TelegramCalendarServiceError('not_a_member')
  return state
}

export async function saveCalendarAvailabilityForActor({ actor, slug, intervals: rawIntervals }: {
  actor: CalendarActor
  slug: string
  intervals: unknown
}) {
  await fetchCalendarStateForActor({ actor, slug })
  if (!Array.isArray(rawIntervals)) throw new TelegramCalendarServiceError('invalid_intervals')
  const intervals: Interval[] = rawIntervals.map((raw) => {
    const startsAt = new Date((raw as { startsAt?: unknown })?.startsAt as string)
    const endsAt = new Date((raw as { endsAt?: unknown })?.endsAt as string)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new TelegramCalendarServiceError('invalid_interval')
    }
    if (!isSlotAligned(startsAt) || !isSlotAligned(endsAt)) throw new TelegramCalendarServiceError('unaligned_interval')
    return { startsAt, endsAt }
  })
  const window = windowBounds(new Date())
  const next = clampToWindow(normalize(intervals), window)
  await withAuditContext({ actorUserId: actor.userId, actorLabel: actor.name, source: actor.source }, async (tx) => {
    await tx.delete(userAvailability).where(and(eq(userAvailability.userId, actor.userId), gte(userAvailability.startsAt, window.start), lt(userAvailability.startsAt, window.end)))
    if (next.length) await tx.insert(userAvailability).values(next.map((interval) => ({ userId: actor.userId, ...interval })))
  }, db)
  return next
}

export async function createCalendarMeetingForActor({ actor, slug, startsAt }: { actor: CalendarActor; slug: string; startsAt: Date }) {
  const schedule = await resolveScheduleBySlug(slug)
  if (!schedule) throw new TelegramCalendarServiceError('not_a_member')
  const created = await withAuditContext({ actorUserId: actor.userId, actorLabel: actor.name, source: actor.source }, async (tx) => {
    await tx.execute(sql`select id from circle_schedules where id = ${schedule.id} for update`)
    const state = await fetchCalendarPublicState({ slug, viewerUserId: actor.userId, isAdmin: actor.isAdmin, now: new Date(), skipCleanup: true }, tx)
    if (!state.circleExists || !state.viewer.canEdit) throw new TelegramCalendarServiceError('not_a_member')
    const overlap = computeOverlap({
      participants: state.participants.map((participant) => ({ ref: participant.ref, intervals: participant.intervals.map((interval) => ({ startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) })), busy: participant.busy.map((block) => ({ meetingId: `${participant.ref}:${block.startsAt}`, startsAt: new Date(block.startsAt), endsAt: new Date(block.endsAt), bookTitle: block.bookTitle ?? '' })) })),
      window: { start: new Date(state.window.start), end: new Date(state.window.end) }, now: new Date(state.now), durationMinutes: state.durationMinutes,
      circleBusy: state.meetings.filter((meeting) => meeting.canceledAt === null).map((meeting) => ({ meetingId: meeting.id, startsAt: new Date(meeting.startsAt), endsAt: new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60 * 1000), bookTitle: state.book.title })),
    })
    if (!overlap.candidateStarts.has(slotKey(startsAt))) throw new TelegramCalendarServiceError('invalid_interval')
    const [row] = await tx.insert(circleMeetings).values({ scheduleId: schedule.id, startsAt, durationMinutes: state.durationMinutes, createdBy: actor.userId }).returning({ id: circleMeetings.id })
    return { id: row.id, markedParticipantsCount: overlap.markedRefs.length }
  }, db)
  await trackCircleMeetingScheduled(actor.userId, schedule.id, created.markedParticipantsCount)
  return { id: created.id }
}

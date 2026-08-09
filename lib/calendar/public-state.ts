import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { toBusyBlocks } from '@/lib/calendar/busy'
import { clampToWindow } from '@/lib/calendar/availability-intervals'
import { windowBounds, type Interval } from '@/lib/calendar/slots'
import { db as defaultDb } from '@/lib/db'
import { books, circleMeetings, circleSchedules, matchingBookAssignments, matchingCircles, userAvailability, users } from '@/lib/db/schema'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'

type DbLike = typeof defaultDb

export interface CalendarPublicState {
  slug: string
  book: { title: string; author: string | null }
  position: number
  circleExists: boolean
  durationMinutes: number
  window: { start: string; end: string }
  now: string
  participants: Array<{
    ref: string
    adminUserId?: string
    displayName: string
    timezone: string | null
    timezoneConfirmed: boolean
    marked: boolean
    intervals: Array<{ startsAt: string; endsAt: string }>
    busy: Array<{ startsAt: string; endsAt: string; bookTitle: string | null }>
  }>
  meetings: Array<{
    id: string
    startsAt: string
    durationMinutes: number
    createdByName: string | null
    canceledAt: string | null
  }>
  viewer: {
    ref: string | null
    canEdit: boolean
    isAdmin: boolean
    actingAsRef: string | null
    timezone: string | null
    timezoneConfirmed: boolean
  }
  migrationRequired: boolean
}

export class CalendarStateError extends Error {
  constructor(public readonly code: 'schedule_not_found') {
    super(code)
  }
}

export function isMissingCalendarSchemaError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : null
  return code === '42P01' || String((error as Error)?.message ?? '').includes('does not exist')
}

export async function fetchCalendarPublicState(input: {
  slug: string
  viewerUserId: string | null
  requestedUserId?: string | null
  isAdmin?: boolean
  now?: Date
}, db: DbLike = defaultDb): Promise<CalendarPublicState> {
  const now = input.now ?? new Date()
  const window = windowBounds(now)
  const schedule = await resolveScheduleBySlug(input.slug, db)
  if (!schedule) throw new CalendarStateError('schedule_not_found')

  await cleanupPastAvailability(window.start, db)

  const actingUserId = input.isAdmin && input.requestedUserId ? input.requestedUserId : input.viewerUserId
  const viewerMember = schedule.members.find((member) => member.userId === actingUserId) ?? null
  const authMember = schedule.members.find((member) => member.userId === input.viewerUserId) ?? null
  const canEdit = Boolean(schedule.circleId && (input.isAdmin || authMember))

  const memberIds = schedule.members.map((member) => member.userId)
  const availabilityRows = memberIds.length === 0 ? [] : await db
    .select({
      userId: userAvailability.userId,
      startsAt: userAvailability.startsAt,
      endsAt: userAvailability.endsAt,
    })
    .from(userAvailability)
    .where(and(
      inArray(userAvailability.userId, memberIds),
      gt(userAvailability.endsAt, window.start),
      lte(userAvailability.startsAt, window.end),
    ))

  const meetings = await readScheduleMeetings(schedule.id, db)
  const busyByUser = await readBusyByUser(memberIds, db)
  const availabilityByUser = new Map<string, Interval[]>()
  for (const row of availabilityRows) {
    const current = availabilityByUser.get(row.userId) ?? []
    current.push({ startsAt: row.startsAt, endsAt: row.endsAt })
    availabilityByUser.set(row.userId, current)
  }

  const participants = schedule.members.map((member) => {
    const intervals = clampToWindow(availabilityByUser.get(member.userId) ?? [], window)
    const busy = busyByUser.get(member.userId) ?? []
    return {
      ref: member.ref,
      ...(input.isAdmin ? { adminUserId: member.userId } : {}),
      displayName: member.displayName,
      timezone: member.timezone,
      timezoneConfirmed: member.timezoneConfirmed,
      marked: intervals.length > 0,
      intervals: intervals.map((interval) => ({
        startsAt: interval.startsAt.toISOString(),
        endsAt: interval.endsAt.toISOString(),
      })),
      busy: busy.map((block) => ({
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        bookTitle: member.userId === actingUserId ? block.bookTitle : null,
      })),
    }
  })

  return {
    slug: schedule.slug,
    book: { title: schedule.bookTitle, author: schedule.bookAuthor },
    position: schedule.position,
    circleExists: schedule.circleId !== null,
    durationMinutes: schedule.durationMinutes,
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    now: now.toISOString(),
    participants,
    meetings,
    viewer: {
      ref: authMember?.ref ?? null,
      canEdit,
      isAdmin: Boolean(input.isAdmin),
      actingAsRef: viewerMember?.ref ?? null,
      timezone: viewerMember?.timezone ?? null,
      timezoneConfirmed: viewerMember?.timezoneConfirmed ?? false,
    },
    migrationRequired: false,
  }
}

export async function readScheduleMeetings(scheduleId: string, db: DbLike = defaultDb) {
  const rows = await db
    .select({
      id: circleMeetings.id,
      startsAt: circleMeetings.startsAt,
      durationMinutes: circleMeetings.durationMinutes,
      canceledAt: circleMeetings.canceledAt,
      createdByName: users.name,
      createdByEmail: users.contactEmail,
    })
    .from(circleMeetings)
    .leftJoin(users, eq(users.id, circleMeetings.createdBy))
    .where(eq(circleMeetings.scheduleId, scheduleId))
  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    createdByName: row.createdByName ?? row.createdByEmail ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
  }))
}

export async function readBusyByUser(userIds: string[], db: DbLike = defaultDb) {
  const result = new Map<string, ReturnType<typeof toBusyBlocks>>()
  if (userIds.length === 0) return result
  const rows = await db
    .select({
      userId: matchingBookAssignments.userId,
      meetingId: circleMeetings.id,
      startsAt: circleMeetings.startsAt,
      durationMinutes: circleMeetings.durationMinutes,
      canceledAt: circleMeetings.canceledAt,
      bookTitle: books.title,
    })
    .from(circleMeetings)
    .innerJoin(circleSchedules, eq(circleSchedules.id, circleMeetings.scheduleId))
    .innerJoin(books, eq(books.id, circleSchedules.bookId))
    .innerJoin(matchingCircles, and(
      eq(matchingCircles.sessionId, circleSchedules.sessionId),
      eq(matchingCircles.bookId, circleSchedules.bookId),
      eq(matchingCircles.position, circleSchedules.position),
    ))
    .innerJoin(matchingBookAssignments, and(
      eq(matchingBookAssignments.sessionId, circleSchedules.sessionId),
      eq(matchingBookAssignments.bookId, circleSchedules.bookId),
      eq(matchingBookAssignments.circleId, matchingCircles.id),
      inArray(matchingBookAssignments.userId, userIds),
    ))
    .where(isNull(circleMeetings.canceledAt))

  for (const userId of userIds) {
    const blocks = toBusyBlocks(rows
      .filter((row) => row.userId === userId)
      .map((row) => ({
        id: row.meetingId,
        startsAt: row.startsAt,
        durationMinutes: row.durationMinutes,
        canceledAt: row.canceledAt,
        bookTitle: row.bookTitle,
      })))
    result.set(userId, blocks)
  }
  return result
}

async function cleanupPastAvailability(windowStart: Date, db: DbLike) {
  await withAuditContext({ actorUserId: null, source: 'system', actorLabel: 'Circle calendar cleanup' }, async (tx) => {
    await tx.delete(userAvailability).where(lte(userAvailability.endsAt, windowStart))
  }, db)
}

export function migrationRequiredState(slug: string): CalendarPublicState {
  const now = new Date()
  const window = windowBounds(now)
  return {
    slug,
    book: { title: 'Календарь круга', author: null },
    position: 1,
    circleExists: false,
    durationMinutes: 60,
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    now: now.toISOString(),
    participants: [],
    meetings: [],
    viewer: {
      ref: null,
      canEdit: false,
      isAdmin: false,
      actingAsRef: null,
      timezone: null,
      timezoneConfirmed: false,
    },
    migrationRequired: true,
  }
}

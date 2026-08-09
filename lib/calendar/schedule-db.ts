import { and, asc, desc, eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { buildSlug } from '@/lib/calendar/slug'
import { db as defaultDb } from '@/lib/db'
import {
  books,
  circleSchedules,
  matchingBookAssignments,
  matchingCircles,
  matchingSessionParticipants,
  matchingSessions,
  users,
} from '@/lib/db/schema'

type DbLike = typeof defaultDb

export interface CircleMember {
  userId: string
  ref: string
  displayName: string
  timezone: string | null
  timezoneConfirmed: boolean
}

export interface ResolvedSchedule {
  id: string
  sessionId: string
  bookId: string
  position: number
  slug: string
  durationMinutes: number
  bookTitle: string
  bookAuthor: string | null
  circleId: string | null
  members: CircleMember[]
}

export function pickSlugForCircle(title: string, position: number, takenSlugs: readonly string[]): string {
  return buildSlug(title, position, new Set(takenSlugs))
}

export async function resolveScheduleBySlug(slug: string, db: DbLike = defaultDb): Promise<ResolvedSchedule | null> {
  const [row] = await db
    .select({
      id: circleSchedules.id,
      sessionId: circleSchedules.sessionId,
      bookId: circleSchedules.bookId,
      position: circleSchedules.position,
      slug: circleSchedules.slug,
      durationMinutes: circleSchedules.durationMinutes,
      bookTitle: books.title,
      bookAuthor: books.author,
    })
    .from(circleSchedules)
    .innerJoin(books, eq(books.id, circleSchedules.bookId))
    .where(eq(circleSchedules.slug, slug))
    .limit(1)

  if (!row) return null
  return hydrateSchedule(row, db)
}

export async function ensureScheduleForCircle(input: {
  sessionId: string
  bookId: string
  position: number
  bookTitle: string
}, db: DbLike = defaultDb): Promise<ResolvedSchedule> {
  const existing = await resolveScheduleIdentity(input, db)
  if (existing) return existing

  await withAuditContext({ actorUserId: null, source: 'system', actorLabel: 'Circle calendar schedule bootstrap' }, async (tx) => {
    const taken = await tx.select({ slug: circleSchedules.slug }).from(circleSchedules)
    const slug = pickSlugForCircle(input.bookTitle, input.position, taken.map((row) => row.slug))
    await tx.insert(circleSchedules).values({
      sessionId: input.sessionId,
      bookId: input.bookId,
      position: input.position,
      slug,
    }).onConflictDoNothing()
  }, db)

  const created = await resolveScheduleIdentity(input, db)
  if (!created) throw new Error('circle_schedule_create_failed')
  return created
}

export async function ensureScheduleForCurrentCircle(input: {
  bookId: string
  position: number
}, db: DbLike = defaultDb): Promise<ResolvedSchedule | null> {
  const [circle] = await db
    .select({
      sessionId: matchingCircles.sessionId,
      bookId: matchingCircles.bookId,
      position: matchingCircles.position,
      bookTitle: books.title,
    })
    .from(matchingCircles)
    .innerJoin(books, eq(books.id, matchingCircles.bookId))
    .innerJoin(matchingSessions, eq(matchingSessions.id, matchingCircles.sessionId))
    .where(and(eq(matchingCircles.bookId, input.bookId), eq(matchingCircles.position, input.position)))
    .orderBy(desc(matchingSessions.createdAt))
    .limit(1)

  if (!circle) return null
  return ensureScheduleForCircle({
    sessionId: circle.sessionId,
    bookId: circle.bookId,
    position: circle.position,
    bookTitle: circle.bookTitle,
  }, db)
}

async function resolveScheduleIdentity(input: {
  sessionId: string
  bookId: string
  position: number
}, db: DbLike): Promise<ResolvedSchedule | null> {
  const [row] = await db
    .select({
      id: circleSchedules.id,
      sessionId: circleSchedules.sessionId,
      bookId: circleSchedules.bookId,
      position: circleSchedules.position,
      slug: circleSchedules.slug,
      durationMinutes: circleSchedules.durationMinutes,
      bookTitle: books.title,
      bookAuthor: books.author,
    })
    .from(circleSchedules)
    .innerJoin(books, eq(books.id, circleSchedules.bookId))
    .where(and(
      eq(circleSchedules.sessionId, input.sessionId),
      eq(circleSchedules.bookId, input.bookId),
      eq(circleSchedules.position, input.position),
    ))
    .limit(1)

  if (!row) return null
  return hydrateSchedule(row, db)
}

async function hydrateSchedule(row: {
  id: string
  sessionId: string
  bookId: string
  position: number
  slug: string
  durationMinutes: number
  bookTitle: string
  bookAuthor: string | null
}, db: DbLike): Promise<ResolvedSchedule> {
  const [circle] = await db
    .select({ id: matchingCircles.id })
    .from(matchingCircles)
    .where(and(
      eq(matchingCircles.sessionId, row.sessionId),
      eq(matchingCircles.bookId, row.bookId),
      eq(matchingCircles.position, row.position),
    ))
    .limit(1)

  const members = circle ? await db
    .select({
      userId: users.id,
      ref: matchingSessionParticipants.publicRef,
      displayName: users.name,
      contactEmail: users.contactEmail,
      timezone: users.timezone,
      timezoneConfirmed: users.timezoneConfirmed,
    })
    .from(matchingBookAssignments)
    .innerJoin(users, eq(users.id, matchingBookAssignments.userId))
    .innerJoin(matchingSessionParticipants, and(
      eq(matchingSessionParticipants.sessionId, matchingBookAssignments.sessionId),
      eq(matchingSessionParticipants.userId, matchingBookAssignments.userId),
    ))
    .where(and(
      eq(matchingBookAssignments.sessionId, row.sessionId),
      eq(matchingBookAssignments.bookId, row.bookId),
      eq(matchingBookAssignments.circleId, circle.id),
    ))
    .orderBy(asc(users.name), asc(users.id))
    : []

  return {
    ...row,
    circleId: circle?.id ?? null,
    members: members.map((member) => ({
      userId: member.userId,
      ref: member.ref,
      displayName: member.displayName ?? member.contactEmail ?? 'Участник',
      timezone: member.timezone,
      timezoneConfirmed: member.timezoneConfirmed,
    })),
  }
}

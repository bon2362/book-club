export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { computeOverlap } from '@/lib/calendar/overlap'
import { fetchCalendarPublicState, isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { slotKey } from '@/lib/calendar/slots'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { circleMeetings } from '@/lib/db/schema'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'

type Params = { params: { slug: string } }

/** Доменный отказ: клиентская подсказка разошлась с состоянием базы. */
class MeetingConflict extends Error {
  constructor(public readonly code: 'not_a_candidate' | 'circle_gone' | 'not_a_member') {
    super(code)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const startsAt = new Date(body.startsAt)
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'invalid_start' }, { status: 400 })

  const viewerUserId = session.user.id
  const isAdmin = Boolean(session.user.isAdmin)

  try {
    const schedule = await resolveScheduleBySlug(params.slug)
    if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 })

    const created = await withAuditContext({
      actorUserId: viewerUserId,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: isAdmin ? 'admin' : 'calendar',
    }, async (tx) => {
      // Блокировка строки пространства сериализует назначение встреч внутри круга:
      // без неё двое участников, нажавших «Назначить» одновременно, оба проходили
      // проверку кандидата и создавали пересекающиеся встречи.
      await tx.execute(sql`select id from circle_schedules where id = ${schedule.id} for update`)

      const state = await fetchCalendarPublicState({
        slug: params.slug,
        viewerUserId,
        isAdmin,
        now: new Date(),
        skipCleanup: true,
      }, tx)

      if (!state.circleExists) throw new MeetingConflict('circle_gone')
      if (!state.viewer.canEdit) throw new MeetingConflict('not_a_member')

      const overlap = computeOverlap({
        participants: state.participants.map((participant) => ({
          ref: participant.ref,
          intervals: participant.intervals.map((interval) => ({
            startsAt: new Date(interval.startsAt),
            endsAt: new Date(interval.endsAt),
          })),
          busy: participant.busy.map((block) => ({
            meetingId: `${participant.ref}:${block.startsAt}`,
            startsAt: new Date(block.startsAt),
            endsAt: new Date(block.endsAt),
            bookTitle: block.bookTitle ?? '',
          })),
        })),
        window: { start: new Date(state.window.start), end: new Date(state.window.end) },
        now: new Date(state.now),
        durationMinutes: state.durationMinutes,
        circleBusy: state.meetings
          .filter((meeting) => meeting.canceledAt === null)
          .map((meeting) => ({
            meetingId: meeting.id,
            startsAt: new Date(meeting.startsAt),
            endsAt: new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60 * 1000),
            bookTitle: state.book.title,
          })),
      })

      if (!overlap.candidateStarts.has(slotKey(startsAt))) throw new MeetingConflict('not_a_candidate')

      const [row] = await tx.insert(circleMeetings).values({
        scheduleId: schedule.id,
        startsAt,
        durationMinutes: state.durationMinutes,
        createdBy: viewerUserId,
      }).returning({ id: circleMeetings.id })
      return row
    }, db)

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (error) {
    if (error instanceof MeetingConflict) {
      return NextResponse.json({ error: error.code }, { status: error.code === 'not_a_member' ? 403 : 409 })
    }
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'meeting_create_failed' }, { status: 500 })
  }
}

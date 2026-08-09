export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { computeOverlap } from '@/lib/calendar/overlap'
import { fetchCalendarPublicState, isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { slotKey } from '@/lib/calendar/slots'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { circleMeetings } from '@/lib/db/schema'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'

type Params = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const startsAt = new Date(body.startsAt)
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'invalid_start' }, { status: 400 })

  try {
    const schedule = await resolveScheduleBySlug(params.slug)
    if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 })
    if (!schedule.circleId) return NextResponse.json({ error: 'circle_gone' }, { status: 409 })
    const state = await fetchCalendarPublicState({
      slug: params.slug,
      viewerUserId: session.user.id,
      isAdmin: Boolean(session.user.isAdmin),
      now: new Date(),
    })
    if (!state.viewer.canEdit) return NextResponse.json({ error: 'not_a_member' }, { status: 403 })

    const overlap = computeOverlap({
      participants: state.participants.map((participant) => ({
        ref: participant.ref,
        intervals: participant.intervals.map((interval) => ({ startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) })),
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
    if (!overlap.candidateStarts.has(slotKey(startsAt))) {
      return NextResponse.json({ error: 'not_a_candidate' }, { status: 409 })
    }

    const [created] = await withAuditContext({
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: session.user.isAdmin ? 'admin' : 'calendar',
    }, async (tx) => tx.insert(circleMeetings).values({
      scheduleId: schedule.id,
      startsAt,
      durationMinutes: schedule.durationMinutes,
      createdBy: session.user.id,
    }).returning({ id: circleMeetings.id }), db)

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'meeting_create_failed' }, { status: 500 })
  }
}

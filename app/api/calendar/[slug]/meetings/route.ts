export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { CalendarActor } from '@/lib/calendar/calendar-actor'
import { createCalendarMeetingForActor, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { auth } from '@/lib/auth'

type Params = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const startsAt = new Date(body.startsAt)
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'invalid_start' }, { status: 400 })

  try {
    const actor: CalendarActor = {
      userId: session.user.id,
      name: session.user.name ?? session.user.contactEmail ?? null,
      isAdmin: Boolean(session.user.isAdmin),
      source: session.user.isAdmin ? 'admin' : 'calendar',
    }
    const meeting = await createCalendarMeetingForActor({ actor, slug: params.slug, startsAt })
    return NextResponse.json({ ok: true, id: meeting.id }, { status: 201 })
  } catch (error) {
    if (error instanceof TelegramCalendarServiceError) {
      if (error.code === 'schedule_not_found') return NextResponse.json({ error: error.code }, { status: 404 })
      return NextResponse.json({ error: error.code }, { status: error.code === 'not_a_member' ? 403 : 409 })
    }
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'meeting_create_failed' }, { status: 500 })
  }
}

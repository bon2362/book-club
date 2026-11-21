import { NextRequest, NextResponse } from 'next/server'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { createCalendarMeetingForActor, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const actor = await resolveTelegramCalendarActor(req)
    const body = await req.json().catch(() => ({}))
    const startsAt = new Date(body.startsAt)
    if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'invalid_start' }, { status: 400 })
    const meeting = await createCalendarMeetingForActor({ actor, slug: params.slug, startsAt })
    return NextResponse.json({ ok: true, id: meeting.id }, { status: 201 })
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) return NextResponse.json({ error: error.code }, { status: error.code === 'telegram_identity_not_linked' ? 403 : 401 })
    if (error instanceof TelegramCalendarServiceError) return NextResponse.json({ error: error.code }, { status: 409 })
    return NextResponse.json({ error: 'meeting_create_failed' }, { status: 500 })
  }
}

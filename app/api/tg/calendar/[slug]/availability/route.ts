import { NextRequest, NextResponse } from 'next/server'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { saveCalendarAvailabilityForActor, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const actor = await resolveTelegramCalendarActor(req)
    const body = await req.json().catch(() => ({}))
    const intervals = await saveCalendarAvailabilityForActor({ actor, slug: params.slug, intervals: body.intervals })
    return NextResponse.json({ ok: true, intervals: intervals.map((interval) => ({ startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() })) })
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) return NextResponse.json({ error: error.code }, { status: error.code === 'telegram_identity_not_linked' ? 403 : 401 })
    if (error instanceof TelegramCalendarServiceError) return NextResponse.json({ error: error.code }, { status: error.code === 'not_a_member' ? 403 : 400 })
    return NextResponse.json({ error: 'availability_save_failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { fetchCalendarStateForActor, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'
import { CalendarStateError, isMissingCalendarSchemaError } from '@/lib/calendar/public-state'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const actor = await resolveTelegramCalendarActor(req)
    return NextResponse.json(await fetchCalendarStateForActor({ actor, slug: params.slug }))
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) return NextResponse.json({ error: error.code }, { status: error.code === 'telegram_identity_not_linked' ? 403 : 401 })
    if (error instanceof CalendarStateError && error.code === 'schedule_not_found') return NextResponse.json({ error: error.code }, { status: 404 })
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    if (error instanceof TelegramCalendarServiceError) return NextResponse.json({ error: error.code }, { status: 403 })
    return NextResponse.json({ error: 'calendar_state_failed' }, { status: 500 })
  }
}

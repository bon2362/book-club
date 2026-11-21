export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { CalendarActor } from '@/lib/calendar/calendar-actor'
import { saveCalendarAvailability, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { auth } from '@/lib/auth'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const requestedUserId = url.searchParams.get('as')?.trim() || null
  if (requestedUserId && !session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const targetUserId = requestedUserId || session.user.id

  const body = await req.json().catch(() => ({}))
  try {
    const actor: CalendarActor = {
      userId: session.user.id,
      name: session.user.name ?? session.user.contactEmail ?? null,
      isAdmin: Boolean(session.user.isAdmin),
      source: requestedUserId ? 'admin' : 'calendar',
    }
    const next = await saveCalendarAvailability({ actor, targetUserId, intervals: body.intervals })
    return NextResponse.json({
      ok: true,
      intervals: next.map((interval) => ({
        startsAt: interval.startsAt.toISOString(),
        endsAt: interval.endsAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof TelegramCalendarServiceError) return NextResponse.json({ error: error.code }, { status: 400 })
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'availability_save_failed' }, { status: 500 })
  }
}

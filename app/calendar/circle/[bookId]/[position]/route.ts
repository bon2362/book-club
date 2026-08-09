export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ensureScheduleForCurrentCircle } from '@/lib/calendar/schedule-db'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'

type Params = { params: { bookId: string; position: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const position = Number(params.position)
  if (!Number.isInteger(position) || position < 1) {
    return NextResponse.json({ error: 'invalid_position' }, { status: 400 })
  }
  try {
    const schedule = await ensureScheduleForCurrentCircle({ bookId: params.bookId, position })
    if (!schedule) return NextResponse.json({ error: 'circle_not_found' }, { status: 404 })
    return NextResponse.redirect(new URL(`/calendar/${schedule.slug}`, req.url), 307)
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ migrationRequired: true }, { status: 200 })
    return NextResponse.json({ error: 'calendar_resolve_failed' }, { status: 500 })
  }
}

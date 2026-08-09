export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lt } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { clampToWindow, normalize } from '@/lib/calendar/availability-intervals'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { isSlotAligned, windowBounds, type Interval } from '@/lib/calendar/slots'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userAvailability } from '@/lib/db/schema'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const requestedUserId = url.searchParams.get('as')?.trim() || null
  if (requestedUserId && !session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const targetUserId = requestedUserId || session.user.id

  const body = await req.json().catch(() => ({}))
  const rawIntervals = Array.isArray(body.intervals) ? body.intervals : null
  if (!rawIntervals) return NextResponse.json({ error: 'invalid_intervals' }, { status: 400 })
  const intervals: Interval[] = []
  for (const raw of rawIntervals) {
    const startsAt = new Date(raw?.startsAt)
    const endsAt = new Date(raw?.endsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: 'invalid_interval' }, { status: 400 })
    }
    if (!isSlotAligned(startsAt) || !isSlotAligned(endsAt)) {
      return NextResponse.json({ error: 'unaligned_interval' }, { status: 400 })
    }
    if (endsAt <= startsAt) return NextResponse.json({ error: 'invalid_interval_order' }, { status: 400 })
    intervals.push({ startsAt, endsAt })
  }

  const window = windowBounds(new Date())
  const next = clampToWindow(normalize(intervals), window)
  try {
    await withAuditContext({
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: requestedUserId ? 'admin' : 'calendar',
    }, async (tx) => {
      await tx.delete(userAvailability).where(and(
        eq(userAvailability.userId, targetUserId),
        gte(userAvailability.startsAt, window.start),
        lt(userAvailability.startsAt, window.end),
      ))
      if (next.length > 0) {
        await tx.insert(userAvailability).values(next.map((interval) => ({
          userId: targetUserId,
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
        })))
      }
    }, db)
    return NextResponse.json({
      ok: true,
      intervals: next.map((interval) => ({
        startsAt: interval.startsAt.toISOString(),
        endsAt: interval.endsAt.toISOString(),
      })),
    })
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'availability_save_failed' }, { status: 500 })
  }
}

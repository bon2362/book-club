export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { fetchCalendarPublicState, isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { circleMeetings } from '@/lib/db/schema'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'

type Params = { params: { slug: string; id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const schedule = await resolveScheduleBySlug(params.slug)
    if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 })
    const state = await fetchCalendarPublicState({
      slug: params.slug,
      viewerUserId: session.user.id,
      isAdmin: Boolean(session.user.isAdmin),
    })
    if (!state.viewer.canEdit) return NextResponse.json({ error: 'not_a_member' }, { status: 403 })

    await withAuditContext({
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: session.user.isAdmin ? 'admin' : 'calendar',
    }, async (tx) => {
      await tx.update(circleMeetings).set({
        canceledAt: new Date(),
        canceledBy: session.user.id,
      }).where(and(
        eq(circleMeetings.id, params.id),
        eq(circleMeetings.scheduleId, schedule.id),
        isNull(circleMeetings.canceledAt),
      ))
    }, db)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'meeting_cancel_failed' }, { status: 500 })
  }
}

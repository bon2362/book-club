export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { fetchCalendarPublicState, CalendarStateError, isMissingCalendarSchemaError, migrationRequiredState } from '@/lib/calendar/public-state'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { circleSchedules } from '@/lib/db/schema'

type Params = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  const url = new URL(req.url)
  const requestedUserId = url.searchParams.get('as')?.trim() || null
  try {
    const state = await fetchCalendarPublicState({
      slug: params.slug,
      viewerUserId: session?.user?.id ?? null,
      requestedUserId,
      isAdmin: Boolean(session?.user?.isAdmin),
    })
    return NextResponse.json(state)
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json(migrationRequiredState(params.slug))
    if (error instanceof CalendarStateError && error.code === 'schedule_not_found') {
      return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'calendar_state_failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const durationMinutes = Number(body.durationMinutes)
  const nextSlug = typeof body.slug === 'string' ? body.slug.trim() : undefined
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes % 30 !== 0) {
    return NextResponse.json({ error: 'invalid_duration' }, { status: 400 })
  }
  if (nextSlug !== undefined && !session.user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
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
      await tx.update(circleSchedules).set({
        durationMinutes,
        ...(nextSlug ? { slug: nextSlug } : {}),
        updatedAt: new Date(),
      }).where(and(eq(circleSchedules.slug, params.slug), eq(circleSchedules.position, state.position)))
    }, db)

    return NextResponse.json({ ok: true, slug: nextSlug || params.slug })
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'calendar_patch_failed' }, { status: 500 })
  }
}

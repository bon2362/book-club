export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const body = await req.json().catch(() => ({}))
  const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : ''
  const confirmed = Boolean(body.confirmed)
  if (!timezone || !isValidTimeZone(timezone)) {
    return NextResponse.json({ error: 'invalid_timezone' }, { status: 400 })
  }
  try {
    await withAuditContext({
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'profile',
    }, async (tx) => {
      await tx.update(users).set({ timezone, timezoneConfirmed: confirmed }).where(eq(users.id, userId))
    }, db)
    return NextResponse.json({ ok: true, timezone, confirmed })
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 409 })
    return NextResponse.json({ error: 'timezone_save_failed' }, { status: 500 })
  }
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

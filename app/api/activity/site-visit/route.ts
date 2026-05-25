export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'

function activityHour(value: Date): string {
  return value.toISOString().slice(0, 13)
}

export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  await bestEffortRecordUserActivity(userId, 'site_visit', {
    occurredAt: now,
    source: 'api',
    sourceId: userId,
    dedupeKey: buildUserActivityDedupeKey(['api', 'site_visit', userId, activityHour(now)]),
  })

  return NextResponse.json({ ok: true })
}

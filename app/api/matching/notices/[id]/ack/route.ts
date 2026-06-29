export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { matchingNotices } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const updated = await withAuditContext(
    {
      actorUserId: userId,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'matching',
    },
    async (tx) => tx
      .update(matchingNotices)
      .set({ readAt: new Date() })
      .where(and(
        eq(matchingNotices.id, params.id),
        eq(matchingNotices.userId, userId),
      ))
      .returning({ id: matchingNotices.id }),
  )

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { bookSubmissions } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const deleted = await withAuditContext(
    { actorUserId: userId, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'submission' },
    async (tx) => {
      const rows = await tx
        .delete(bookSubmissions)
        .where(and(eq(bookSubmissions.id, params.id), eq(bookSubmissions.userId, userId)))
        .returning()
      return rows
    },
  )

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

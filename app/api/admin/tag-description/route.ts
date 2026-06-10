export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { tagDescriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tag, description } = await req.json() as { tag: string; description: string }
  if (!tag) {
    return NextResponse.json({ error: 'Missing tag' }, { status: 400 })
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => {
      if (!description.trim()) {
        await tx.delete(tagDescriptions).where(eq(tagDescriptions.tag, tag))
      } else {
        await tx.insert(tagDescriptions).values({ tag, description: description.trim() }).onConflictDoUpdate({
          target: tagDescriptions.tag,
          set: { description: description.trim() },
        })
      }
    },
  )

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { deleteSection } from '@/lib/intro'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const result = await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => deleteSection(params.id, tx),
  )
  if (!result.ok) {
    if (result.reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (result.reason === 'header_protected') return NextResponse.json({ error: 'Cannot delete header' }, { status: 400 })
  }
  revalidateTag('intro')
  return NextResponse.json({ ok: true })
}

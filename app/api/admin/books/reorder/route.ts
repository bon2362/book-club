export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { books } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'

/**
 * PUT /api/admin/books/reorder
 *
 * Body: { ids: string[] } — full ordered list of published book ids.
 * Rewrites `sort_order` for each id to its 1-based position.
 * Books not in the list are left untouched.
 *
 * Note: drizzle-orm/neon-http does not support interactive transactions,
 * so updates are issued sequentially without a transaction wrapper.
 * A partial failure leaves an inconsistent sort order that the user can
 * fix by reordering again — acceptable for a cosmetic ordering operation.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = (body as { ids?: unknown })?.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '`ids` must be a non-empty array of strings' }, { status: 400 })
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: '`ids` must contain only non-empty strings' }, { status: 400 })
  }

  try {
    const now = new Date()
    await withAuditContext(
      { actorUserId: session.user.id, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'admin' },
      async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(books)
            .set({ sortOrder: i + 1, updatedAt: now })
            .where(eq(books.id, ids[i] as string))
        }
      },
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reorder] failed:', err)
    return NextResponse.json({ error: 'Internal error while reordering' }, { status: 500 })
  }
}

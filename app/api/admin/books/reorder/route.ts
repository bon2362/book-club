export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * PUT /api/admin/books/reorder
 *
 * Body: { ids: string[] } — full list of book ids in the desired order. The
 * client sends the published-section ids only; this endpoint rewrites
 * `sort_order` for each id in the list to its 1-based position, inside a single
 * transaction so partial failures cannot leave the catalog in a torn state.
 *
 * Books whose ids are not in the list are left untouched.
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

  const now = new Date()
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(books)
        .set({ sortOrder: i + 1, updatedAt: now })
        .where(eq(books.id, ids[i] as string))
    }
  })

  return NextResponse.json({ success: true })
}

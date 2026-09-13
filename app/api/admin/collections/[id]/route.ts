export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { diffCollection } from '@/lib/collections/diff'
import { collectionAuditContext, collectionErrorResponse, readContentBody, requireAdminSession } from '@/lib/collections/http'
import { deleteCollection, loadCollectionById, loadEditorBooks, saveCollectionContent, serializeCollection } from '@/lib/collections/repo'
import { snapshotOf } from '@/lib/collections/rules'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden

  try {
    const record = await loadCollectionById(params.id)
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    // Книги снимка тоже нужны: у убранных из подборки книг экран разницы показывает названия.
    const bookIds = Array.from(new Set([...record.bookIds, ...(record.reviewedSnapshot?.bookIds ?? [])]))
    const books = await loadEditorBooks(bookIds)
    const diff = record.reviewedSnapshot ? diffCollection(record.reviewedSnapshot, snapshotOf(record)) : null
    return NextResponse.json({ collection: serializeCollection(record), books, diff })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden

  try {
    const content = await readContentBody(req)
    const saved = await withAuditContext(
      collectionAuditContext(session, 'admin'),
      (tx) => saveCollectionContent(tx as never, { id: params.id, content, by: 'admin', now: new Date() }),
    )
    return NextResponse.json({ collection: serializeCollection(saved) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden

  try {
    await withAuditContext(collectionAuditContext(session, 'admin'), (tx) => deleteCollection(tx as never, params.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

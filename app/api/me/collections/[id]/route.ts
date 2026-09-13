import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { collectionAuditContext, collectionErrorResponse, readContentBody, viewerFromSession } from '@/lib/collections/http'
import { deleteCollection, loadCollectionById, saveCollectionContent, serializeCollection } from '@/lib/collections/repo'
import { canDeleteCollection, isCollectionOwner } from '@/lib/collections/rules'
import type { AuthSession } from '@/lib/signup-selection'

export const dynamic = 'force-dynamic'
type Params = { params: { id: string } }
async function own(id: string, session: AuthSession) { const record = await loadCollectionById(id); return record && isCollectionOwner(record, viewerFromSession(session)) ? record : null }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { if (!await own(params.id, session as AuthSession)) return NextResponse.json({ error: 'not_found' }, { status: 404 }); const content = await readContentBody(req); const saved = await withAuditContext(collectionAuditContext(session as AuthSession, 'collections'), tx => saveCollectionContent(tx as never, { id: params.id, content, by: 'author', now: new Date() })); return NextResponse.json({ collection: serializeCollection(saved) }) } catch (error) { return collectionErrorResponse(error) }
}
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { const record = await own(params.id, session as AuthSession); if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 }); if (!canDeleteCollection(record, viewerFromSession(session))) return NextResponse.json({ error: 'forbidden' }, { status: 403 }); await withAuditContext(collectionAuditContext(session as AuthSession, 'collections'), tx => deleteCollection(tx as never, params.id)); return NextResponse.json({ ok: true }) } catch (error) { return collectionErrorResponse(error) }
}

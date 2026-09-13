import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { collectionAuditContext, collectionErrorResponse, viewerFromSession } from '@/lib/collections/http'
import { loadCollectionById, serializeCollection, submitCollection } from '@/lib/collections/repo'
import { isCollectionOwner } from '@/lib/collections/rules'
import type { AuthSession } from '@/lib/signup-selection'

export const dynamic = 'force-dynamic'
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { const record = await loadCollectionById(params.id); if (!record || !isCollectionOwner(record, viewerFromSession(session))) return NextResponse.json({ error: 'not_found' }, { status: 404 }); const submitted = await withAuditContext(collectionAuditContext(session as AuthSession, 'collections'), tx => submitCollection(tx as never, { id: params.id, now: new Date() })); return NextResponse.json({ collection: serializeCollection(submitted) }) } catch (error) { return collectionErrorResponse(error) }
}

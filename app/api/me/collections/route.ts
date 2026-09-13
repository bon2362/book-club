import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { collectionAuditContext, collectionErrorResponse } from '@/lib/collections/http'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { createDraftCollection, listMyCollections, serializeCollection } from '@/lib/collections/repo'
import type { AuthSession } from '@/lib/signup-selection'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json({ collections: await listMyCollections(session.user.id) }) }
  catch (error) { return isMissingCollectionsSchemaError(error) ? NextResponse.json({ collections: [] }) : collectionErrorResponse(error) }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authorUserId = session.user.id
  const body = await req.json().catch(() => ({})) as { title?: unknown }
  try {
    const record = await withAuditContext(collectionAuditContext(session as AuthSession, 'collections'), (tx) =>
      createDraftCollection(tx as never, { authorUserId, title: typeof body.title === 'string' ? body.title : '', now: new Date() }))
    return NextResponse.json({ collection: serializeCollection(record) }, { status: 201 })
  } catch (error) { return collectionErrorResponse(error) }
}

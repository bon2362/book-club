export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { collectionAuditContext, collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'
import { getSiteSetting, setSiteSetting } from '@/lib/site-settings'

export async function GET() {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  return NextResponse.json({ homeBlockEnabled: await getSiteSetting('collections_home_block_enabled') })
}

export async function PATCH(req: NextRequest) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden

  const body = await req.json().catch(() => ({})) as { homeBlockEnabled?: unknown }
  if (typeof body.homeBlockEnabled !== 'boolean') {
    return NextResponse.json({ error: 'validation', issues: ['invalid_body'] }, { status: 400 })
  }
  const value = body.homeBlockEnabled

  try {
    await withAuditContext(
      collectionAuditContext(session, 'admin'),
      (tx) => setSiteSetting(tx as never, 'collections_home_block_enabled', value),
    )
    return NextResponse.json({ homeBlockEnabled: value })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

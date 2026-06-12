export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import {
  IdentityConflictError,
  MergeValidationError,
  MissingMergeUserError,
  mergeUsers,
  validateMergeRequest,
} from '@/lib/admin/user-merge'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const input = validateMergeRequest({
      ...(body && typeof body === 'object' ? body : {}),
      currentAdminUserId: session.user.id,
    })

    const result = await withAuditContext(
      {
        actorUserId: session.user.id,
        actorLabel: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
        reason: input.reason,
      },
      tx => mergeUsers(tx, {
        ...input,
        actorUserId: session.user.id ?? null,
      }),
    )

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    if (error instanceof MergeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof MissingMergeUserError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof IdentityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('admin user merge failed', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { verifyGoogleCredential } from '@/lib/google-credential'
import { IdentityConflictError, linkVerifiedIdentityToUser } from '@/lib/user-identities'

type RequestBody = {
  credential?: unknown
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid credential' }, { status: 400 })
  }

  if (typeof body.credential !== 'string' || !body.credential.trim()) {
    return NextResponse.json({ error: 'Invalid credential' }, { status: 400 })
  }

  const payload = await verifyGoogleCredential(body.credential)
  if (!payload?.sub || !payload.email || payload.email_verified === false) {
    return NextResponse.json({ error: 'Invalid credential' }, { status: 400 })
  }

  const now = new Date()
  const email = typeof payload.email === 'string' ? payload.email : null
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name : email
  const image = typeof payload.picture === 'string' && payload.picture.trim() ? payload.picture : null

  try {
    await withAuditContext(
      {
        actorUserId: userId,
        actorLabel: session.user?.name ?? session.user?.email ?? session.user?.contactEmail ?? null,
        source: 'account-linking',
      },
      async (tx) => linkVerifiedIdentityToUser(userId, 'google', payload.sub!, {
        email,
        emailVerified: true,
        name,
        image,
        now,
        metadata: { source: 'account-linking-google' },
      }, tx),
    )
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return NextResponse.json({ error: 'identity_conflict' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({
    ok: true,
    identity: {
      provider: 'google',
      email,
      telegramUsername: null,
      lastSeenAt: now.toISOString(),
    },
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

interface Params { params: { id: string; circleId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId, circleId } = params

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
      },
      action: { type: 'dissolve_circle', circleId, reason },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return transitionError(error)
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

type Params = { params: { id: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const body = await req.json().catch(() => ({}))
  const version = Number.isInteger(body.expectedStateVersion) && body.expectedStateVersion >= 0
    ? Number(body.expectedStateVersion)
    : null
  if (version === null) {
    return NextResponse.json({ error: 'expectedStateVersion required' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'matching',
      },
      expectedStateVersion: version,
      action: { type: 'leave', userId },
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof MatchingTransitionError) {
      const status = error.code === 'session_not_found' ? 404 : 409
      return NextResponse.json({ error: error.code }, { status })
    }
    return NextResponse.json({ error: 'matching_transition_failed' }, { status: 500 })
  }
}

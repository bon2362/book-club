export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchMatchingPublicState } from '@/lib/matching/public-state-db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError, type MatchingAction } from '@/lib/matching/session-transition'
import { expectedVersion, transitionError } from '@/lib/matching/transition-http'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const version = expectedVersion(body.expectedStateVersion)
  if (version === null) return NextResponse.json({ error: 'expectedStateVersion required' }, { status: 400 })
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  const actions: Record<string, MatchingAction> = {
    setConditional: { type: 'set_conditional', userId: session.user.id, bookId },
    unsetConditional: { type: 'unset_conditional', userId: session.user.id, bookId },
    setHard: { type: 'set_hard', userId: session.user.id, bookId },
    cancelHard: { type: 'cancel_hard', userId: session.user.id },
  }
  const action = actions[body.action]
  if (!action || (action.type !== 'cancel_hard' && !bookId)) {
    return NextResponse.json({ error: 'invalid book action' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: { userId: session.user.id, label: session.user.name ?? session.user.contactEmail ?? null, source: 'matching' },
      expectedStateVersion: version,
      action,
    })
    const state = await fetchMatchingPublicState(params.id, session.user.id)
    return NextResponse.json({ ...result, state })
  } catch (error) {
    if (error instanceof MatchingTransitionError && error.code === 'stale_state') {
      const state = await fetchMatchingPublicState(params.id, session.user.id)
      return NextResponse.json({ error: error.code, state }, { status: 409 })
    }
    return transitionError(error)
  }
}

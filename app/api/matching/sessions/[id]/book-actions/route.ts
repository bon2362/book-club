export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchMatchingPublicState, PublicMatchingStateError } from '@/lib/matching/public-state-db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError, type MatchingAction } from '@/lib/matching/session-transition'
import { expectedVersion, transitionError } from '@/lib/matching/transition-http'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const requestUrl = new URL(req.url)
  const hasRequestedUser = requestUrl.searchParams.has('as')
  const requestedUserId = requestUrl.searchParams.get('as')?.trim() ?? null
  if (hasRequestedUser && !session.user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (hasRequestedUser && !requestedUserId) {
    return NextResponse.json({ error: 'as must be a non-empty user id' }, { status: 400 })
  }
  const userId = requestedUserId ?? session.user.id
  const body = await req.json().catch(() => ({}))
  const version = expectedVersion(body.expectedStateVersion)
  if (version === null) return NextResponse.json({ error: 'expectedStateVersion required' }, { status: 400 })
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  const actions: Record<string, MatchingAction> = {
    setConditional: { type: 'set_conditional', userId, bookId },
    unsetConditional: { type: 'unset_conditional', userId, bookId },
    setHard: { type: 'set_hard', userId, bookId },
    cancelHard: { type: 'cancel_hard', userId, bookId },
  }
  const action = actions[body.action]
  if (!action || !bookId) {
    return NextResponse.json({ error: 'invalid book action' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: requestedUserId ? 'admin' : 'matching',
      },
      expectedStateVersion: version,
      action,
    })
    const state = await fetchMatchingPublicState(params.id, userId)
    return NextResponse.json({ ...result, state })
  } catch (error) {
    if (error instanceof MatchingTransitionError && error.code === 'stale_state') {
      try {
        const state = await fetchMatchingPublicState(params.id, userId)
        return NextResponse.json({ error: error.code, state }, { status: 409 })
      } catch (stateError) {
        return publicStateError(stateError)
      }
    }
    if (error instanceof PublicMatchingStateError) return publicStateError(error)
    return transitionError(error)
  }
}

function publicStateError(error: unknown) {
  if (error instanceof PublicMatchingStateError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.code === 'session_not_found' ? 404 : 403 },
    )
  }
  return NextResponse.json({ error: 'matching_state_failed' }, { status: 500 })
}

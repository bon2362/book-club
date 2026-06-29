export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import {
  MatchingTransitionError,
  type MatchingTransitionErrorCode,
} from '@/lib/matching/session-transition'

type Params = { params: { id: string } }

function transitionStatus(code: MatchingTransitionErrorCode): number {
  switch (code) {
    case 'session_not_found':
    case 'circle_not_found':
      return 404
    case 'participant_missing':
      return 403
    case 'session_frozen':
    case 'stale_state':
    case 'participant_locked':
      return 409
    case 'cascade_limit':
      return 500
  }
}

function transitionError(error: unknown): NextResponse {
  if (error instanceof MatchingTransitionError) {
    return NextResponse.json(
      { error: error.code },
      { status: transitionStatus(error.code) },
    )
  }
  return NextResponse.json({ error: 'matching_transition_failed' }, { status: 500 })
}

function expectedVersion(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const circleKey = typeof body.circleKey === 'string' ? body.circleKey.trim() : ''
  const version = expectedVersion(body.expectedStateVersion)
  if (!circleKey || version === null) {
    return NextResponse.json(
      { error: 'circleKey and expectedStateVersion required' },
      { status: 400 },
    )
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'matching',
      },
      expectedStateVersion: version,
      action: {
        type: 'set_confirmation',
        userId: session.user.id,
        circleKey,
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    return transitionError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const version = expectedVersion(body.expectedStateVersion)
  if (version === null) {
    return NextResponse.json(
      { error: 'expectedStateVersion required' },
      { status: 400 },
    )
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'matching',
      },
      expectedStateVersion: version,
      action: { type: 'cancel_confirmation', userId: session.user.id },
    })
    return NextResponse.json(result)
  } catch (error) {
    return transitionError(error)
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { expectedVersion, transitionError } from '@/lib/matching/transition-http'

type Params = { params: { id: string } }

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

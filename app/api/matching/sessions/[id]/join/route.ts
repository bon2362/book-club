export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: { userId: session.user.id, label: name, source: 'matching' },
      action: { type: 'self_join', userId: session.user.id, name },
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

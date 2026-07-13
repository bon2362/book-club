export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchMatchingPublicState } from '@/lib/matching/public-state-db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError, type MatchingAction } from '@/lib/matching/session-transition'
import { expectedVersion, transitionError } from '@/lib/matching/transition-http'

type Params = { params: { id: string } }

function parseAction(body: Record<string, unknown>): MatchingAction | null {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : ''
  const circleId = typeof body.circleId === 'string' ? body.circleId.trim() : null
  switch (body.action) {
    case 'initializeBookMode': return { type: 'initialize_book_mode' }
    case 'assign': return userId && bookId ? { type: 'admin_assign_book', userId, bookId } : null
    case 'unassign': return userId ? { type: 'admin_unassign_book', userId } : null
    case 'removeParticipant': return userId ? { type: 'admin_remove', userId } : null
    case 'createCircle': return bookId ? { type: 'admin_create_book_circle', bookId } : null
    case 'deleteCircle': return circleId ? { type: 'admin_delete_book_circle', circleId } : null
    case 'place': return userId ? { type: 'admin_place_book_assignment', userId, circleId } : null
    case 'closeSession': return { type: 'close_session' }
    case 'reopenSession': return { type: 'reopen_session' }
    default: return null
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = parseAction(body)
  const version = expectedVersion(body.expectedStateVersion)
  if (!action || version === null) return NextResponse.json({ error: 'invalid admin book action' }, { status: 400 })

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: { userId: session.user.id, label: session.user.name ?? session.user.contactEmail ?? null, source: 'admin' },
      expectedStateVersion: version,
      action,
    })
    const state = await fetchMatchingPublicState(params.id, session.user.id, undefined, { admin: true })
    return NextResponse.json({ ...result, state })
  } catch (error) {
    if (error instanceof MatchingTransitionError && error.code === 'stale_state') {
      const state = await fetchMatchingPublicState(params.id, session.user.id, undefined, { admin: true })
      return NextResponse.json({ error: error.code, state }, { status: 409 })
    }
    return transitionError(error)
  }
}

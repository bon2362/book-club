export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  fetchMatchingPublicState,
  PublicMatchingStateError,
} from '@/lib/matching/public-state-db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const sessionId = params.get('session')
  if (!sessionId) {
    return NextResponse.json({ error: 'session param required' }, { status: 400 })
  }
  const requestedUserId = params.get('as')
  const viewerUserId = session.user.isAdmin && requestedUserId
    ? requestedUserId
    : session.user.id

  try {
    return NextResponse.json(await fetchMatchingPublicState(sessionId, viewerUserId))
  } catch (error) {
    if (error instanceof PublicMatchingStateError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.code === 'session_not_found' ? 404 : 403 },
      )
    }
    return NextResponse.json({ error: 'matching_state_failed' }, { status: 500 })
  }
}

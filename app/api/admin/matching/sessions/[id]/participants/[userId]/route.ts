export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

interface Params { params: { id: string; userId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: sessionId, userId } = params

  try {
    const result = await runMatchingTransition({
      sessionId,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
      },
      action: { type: 'admin_remove', userId },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return transitionError(error)
  }
}

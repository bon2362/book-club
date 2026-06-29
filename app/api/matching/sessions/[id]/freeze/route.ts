export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
      },
      action: { type: 'freeze' },
    })
    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (error) {
    return transitionError(error)
  }
}

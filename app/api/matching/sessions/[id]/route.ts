export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const targetGroupSize = body.targetGroupSize
  if (!Number.isInteger(targetGroupSize) || targetGroupSize < 2) {
    return NextResponse.json({ error: 'targetGroupSize must be an integer >= 2' }, { status: 400 })
  }

  const [matchSession] = await db
    .select({ id: matchingSessions.id, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (matchSession.status === 'frozen') return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })

  await db
    .update(matchingSessions)
    .set({ targetGroupSize })
    .where(eq(matchingSessions.id, params.id))

  broadcast(params.id, 'state_changed', {
    kind: 'target_group_size_updated',
    targetGroupSize,
    userId: session.user.id,
  })

  return NextResponse.json({ ok: true, targetGroupSize }, { status: 200 })
}

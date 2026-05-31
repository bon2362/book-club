export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '@/lib/matching/realtime/hub'

type Params = { params: { id: string } }
const MAX_GROUP_SIZE_LIMIT = 10

function parseGroupSizeRange(body: unknown): { minGroupSize: number; maxGroupSize: number } | { error: string } {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const minGroupSize = record.minGroupSize
  const maxGroupSize = record.maxGroupSize

  if (typeof minGroupSize !== 'number' || typeof maxGroupSize !== 'number' || !Number.isInteger(minGroupSize) || !Number.isInteger(maxGroupSize)) {
    return { error: 'minGroupSize and maxGroupSize must be integers' }
  }
  if (minGroupSize < 2) return { error: 'minGroupSize must be an integer >= 2' }
  if (maxGroupSize < minGroupSize) return { error: 'maxGroupSize must be greater than or equal to minGroupSize' }
  if (maxGroupSize > MAX_GROUP_SIZE_LIMIT) return { error: `maxGroupSize must be <= ${MAX_GROUP_SIZE_LIMIT}` }

  return { minGroupSize, maxGroupSize }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const groupSizeRange = parseGroupSizeRange(body)
  if ('error' in groupSizeRange) return NextResponse.json({ error: groupSizeRange.error }, { status: 400 })

  const [matchSession] = await db
    .select({ id: matchingSessions.id, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, params.id))
    .limit(1)

  if (!matchSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (matchSession.status === 'frozen') return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })

  await db
    .update(matchingSessions)
    .set({ minGroupSize: groupSizeRange.minGroupSize, maxGroupSize: groupSizeRange.maxGroupSize })
    .where(eq(matchingSessions.id, params.id))

  broadcast(params.id, 'state_changed', {
    kind: 'group_size_range_updated',
    minGroupSize: groupSizeRange.minGroupSize,
    maxGroupSize: groupSizeRange.maxGroupSize,
    userId: session.user.id,
  })

  return NextResponse.json({ ok: true, ...groupSizeRange }, { status: 200 })
}

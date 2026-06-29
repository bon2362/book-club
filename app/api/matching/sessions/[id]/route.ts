export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

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
  if (!session?.user?.isAdmin || !session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const groupSizeRange = parseGroupSizeRange(body)
  if ('error' in groupSizeRange) return NextResponse.json({ error: groupSizeRange.error }, { status: 400 })

  try {
    await runMatchingTransition({
      sessionId: params.id,
      actor: {
        userId: session.user.id,
        label: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
      },
      action: {
        type: 'change_group_size',
        min: groupSizeRange.minGroupSize,
        max: groupSizeRange.maxGroupSize,
      },
    })
  } catch (error) {
    return transitionError(error)
  }

  return NextResponse.json({ ok: true, ...groupSizeRange }, { status: 200 })
}

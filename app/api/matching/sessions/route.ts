export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'

interface CreateSessionBody {
  name: string
  minGroupSize?: number
  maxGroupSize?: number
  deadlineAt?: string | null
}

const MAX_GROUP_SIZE_LIMIT = 10

function parseGroupSizeRange(body: CreateSessionBody): { minGroupSize: number; maxGroupSize: number } | { error: string } {
  const minGroupSize = typeof body.minGroupSize === 'number' ? body.minGroupSize : 3
  const maxGroupSize = typeof body.maxGroupSize === 'number' ? body.maxGroupSize : minGroupSize

  if (!Number.isInteger(minGroupSize) || !Number.isInteger(maxGroupSize)) {
    return { error: 'minGroupSize and maxGroupSize must be integers' }
  }
  if (minGroupSize < 2) return { error: 'minGroupSize must be an integer >= 2' }
  if (maxGroupSize < minGroupSize) return { error: 'maxGroupSize must be greater than or equal to minGroupSize' }
  if (maxGroupSize > MAX_GROUP_SIZE_LIMIT) return { error: `maxGroupSize must be <= ${MAX_GROUP_SIZE_LIMIT}` }

  return { minGroupSize, maxGroupSize }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const actorId = session.user.id

  let body: CreateSessionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const groupSizeRange = parseGroupSizeRange(body)
  if ('error' in groupSizeRange) return NextResponse.json({ error: groupSizeRange.error }, { status: 400 })

  let deadlineAt: Date | null = null
  if (body.deadlineAt) {
    deadlineAt = new Date(body.deadlineAt)
    if (isNaN(deadlineAt.getTime())) {
      return NextResponse.json({ error: 'deadlineAt is not a valid date' }, { status: 400 })
    }
  }

  // Check for existing active session (partial unique index enforces this at DB level too)
  const existing = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'An active session already exists', activeSessionId: existing[0].id },
      { status: 409 },
    )
  }

  const [created] = await withAuditContext(
    { actorUserId: actorId, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'admin' },
    async (tx) => {
      const rows = await tx
        .insert(matchingSessions)
        .values({
          name,
          createdBy: actorId,
          status: 'active',
          minGroupSize: groupSizeRange.minGroupSize,
          maxGroupSize: groupSizeRange.maxGroupSize,
          deadlineAt,
        })
        .returning({
          id: matchingSessions.id,
          name: matchingSessions.name,
          status: matchingSessions.status,
          minGroupSize: matchingSessions.minGroupSize,
          maxGroupSize: matchingSessions.maxGroupSize,
        })
      return rows
    },
  )

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sessions = await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      minGroupSize: matchingSessions.minGroupSize,
      maxGroupSize: matchingSessions.maxGroupSize,
      deadlineAt: matchingSessions.deadlineAt,
      createdAt: matchingSessions.createdAt,
      frozenAt: matchingSessions.frozenAt,
      frozenScenarioJson: matchingSessions.frozenScenarioJson,
      stateVersion: matchingSessions.stateVersion,
    })
    .from(matchingSessions)
    .orderBy(matchingSessions.createdAt)

  return NextResponse.json({ success: true, data: sessions })
}

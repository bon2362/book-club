export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

interface CreateSessionBody {
  name: string
  targetGroupSize?: number
  deadlineAt?: string | null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  const targetGroupSize = typeof body.targetGroupSize === 'number' ? body.targetGroupSize : 3
  if (!Number.isInteger(targetGroupSize) || targetGroupSize < 2) {
    return NextResponse.json({ error: 'targetGroupSize must be an integer ≥ 2' }, { status: 400 })
  }

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

  const [created] = await db
    .insert(matchingSessions)
    .values({
      name,
      createdBy: session.user.id,
      status: 'active',
      targetGroupSize,
      deadlineAt,
    })
    .returning({ id: matchingSessions.id, name: matchingSessions.name, status: matchingSessions.status })

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sessions = await db
    .select()
    .from(matchingSessions)
    .orderBy(matchingSessions.createdAt)

  return NextResponse.json({ success: true, data: sessions })
}

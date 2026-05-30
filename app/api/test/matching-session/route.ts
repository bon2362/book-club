// Test-only endpoint for creating/removing an isolated matching session.
// Guarded by isTestEndpointAllowed() so it never runs in production.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

type MatchingSessionOverrides = {
  name?: string
  targetGroupSize?: number
  deadlineAt?: string | null
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const overrides = (await req.json().catch(() => ({}))) as MatchingSessionOverrides
  await db
    .update(matchingSessions)
    .set({ status: 'frozen', frozenAt: new Date() })
    .where(eq(matchingSessions.status, 'active'))

  const [created] = await db
    .insert(matchingSessions)
    .values({
      name: overrides.name ?? `E2E Matching ${Date.now().toString(36)}`,
      status: 'active',
      targetGroupSize: overrides.targetGroupSize ?? 3,
      deadlineAt: overrides.deadlineAt ? new Date(overrides.deadlineAt) : null,
    })
    .returning({
      id: matchingSessions.id,
      name: matchingSessions.name,
      targetGroupSize: matchingSessions.targetGroupSize,
    })

  return NextResponse.json({ session: created }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(matchingSessions).where(eq(matchingSessions.id, id))
  return NextResponse.json({ ok: true })
}

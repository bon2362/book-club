// Test-only endpoint for creating/removing an isolated matching session.
// Guarded by isTestEndpointAllowed() so it never runs in production.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'
import { and, eq, lt } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

type MatchingSessionOverrides = {
  name?: string
  minGroupSize?: number
  maxGroupSize?: number
  deadlineAt?: string | null
  optimizationMode?: string
}

const ACTIVE_SLOT_TIMEOUT_MS = 120_000
const ACTIVE_SLOT_POLL_MS = 500
const STALE_ACTIVE_MS = 5 * 60 * 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForActiveSlot() {
  const startedAt = Date.now()

  while (Date.now() - startedAt < ACTIVE_SLOT_TIMEOUT_MS) {
    await db
      .update(matchingSessions)
      .set({ status: 'frozen', frozenAt: new Date() })
      .where(
        and(
          eq(matchingSessions.status, 'active'),
          lt(matchingSessions.createdAt, new Date(Date.now() - STALE_ACTIVE_MS)),
        ),
      )

    const [active] = await db
      .select({ id: matchingSessions.id })
      .from(matchingSessions)
      .where(eq(matchingSessions.status, 'active'))
      .limit(1)

    if (!active) return
    await sleep(ACTIVE_SLOT_POLL_MS)
  }

  throw new Error('E2E_MATCHING_ACTIVE_SLOT_TIMEOUT')
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const overrides = (await req.json().catch(() => ({}))) as MatchingSessionOverrides
  const optimizationMode = overrides.optimizationMode ?? 'coverage'
  if (optimizationMode !== 'coverage' && optimizationMode !== 'satisfaction') {
    return NextResponse.json({ error: "optimizationMode must be 'coverage' or 'satisfaction'" }, { status: 400 })
  }
  const startedAt = Date.now()

  while (Date.now() - startedAt < ACTIVE_SLOT_TIMEOUT_MS) {
    await waitForActiveSlot()

    try {
      const [created] = await db
        .insert(matchingSessions)
        .values({
          name: overrides.name ?? `E2E Matching ${Date.now().toString(36)}`,
          status: 'active',
          minGroupSize: overrides.minGroupSize ?? 3,
          maxGroupSize: overrides.maxGroupSize ?? overrides.minGroupSize ?? 3,
          optimizationMode,
          deadlineAt: overrides.deadlineAt ? new Date(overrides.deadlineAt) : null,
        })
        .returning({
          id: matchingSessions.id,
          name: matchingSessions.name,
          minGroupSize: matchingSessions.minGroupSize,
          maxGroupSize: matchingSessions.maxGroupSize,
          optimizationMode: matchingSessions.optimizationMode,
        })

      return NextResponse.json({ session: created }, { status: 201 })
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'cause' in error
        ? (error as { cause?: { code?: string } }).cause?.code
        : undefined
      if (code !== '23505') throw error
      await sleep(ACTIVE_SLOT_POLL_MS)
    }
  }

  return NextResponse.json({ error: 'Timed out waiting for active matching session slot' }, { status: 503 })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(matchingSessions).where(eq(matchingSessions.id, id))
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const conditions: SQL[] = []
  const actor = p.get('actorUserId')
  const entityType = p.get('entityType')
  const entityId = p.get('entityId')
  const source = p.get('source')
  const from = p.get('from')
  const to = p.get('to')

  if (actor) conditions.push(eq(auditLog.actorUserId, actor))
  if (entityType) conditions.push(eq(auditLog.entityType, entityType))
  if (entityId) conditions.push(eq(auditLog.entityId, entityId))
  if (source) conditions.push(eq(auditLog.source, source))
  if (from) conditions.push(gte(auditLog.occurredAt, new Date(from)))
  if (to) conditions.push(lte(auditLog.occurredAt, new Date(to)))

  const base = db.select().from(auditLog)
  const filtered = conditions.length ? base.where(and(...conditions)) : base
  const rows = await filtered.orderBy(desc(auditLog.occurredAt)).limit(parseLimit(p.get('limit')))

  return NextResponse.json({ events: rows })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const DEFAULT_SORT_BY = 'occurredAt'
const DEFAULT_SORT_DIR = 'desc'

type SortKey = 'occurredAt' | 'source' | 'action' | 'entityType' | 'entityId' | 'actorLabel'
const SORT_WHITELIST: SortKey[] = ['occurredAt', 'source', 'action', 'entityType', 'entityId', 'actorLabel']

const SORT_COLUMN_MAP = {
  occurredAt: auditLog.occurredAt,
  source: auditLog.source,
  action: auditLog.action,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  actorLabel: auditLog.actorLabel,
} as const

function parsePage(value: string | null): number {
  if (!value) return DEFAULT_PAGE
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_PAGE
  return parsed
}

function parsePageSize(value: string | null): number {
  if (!value) return DEFAULT_PAGE_SIZE
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

function parseSortBy(value: string | null): SortKey {
  if (value && (SORT_WHITELIST as string[]).includes(value)) return value as SortKey
  return DEFAULT_SORT_BY
}

function parseSortDir(value: string | null): 'asc' | 'desc' {
  if (value === 'asc' || value === 'desc') return value
  return DEFAULT_SORT_DIR
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

  const page = parsePage(p.get('page'))
  const pageSize = parsePageSize(p.get('pageSize'))
  const sortBy = parseSortBy(p.get('sortBy'))
  const sortDir = parseSortDir(p.get('sortDir'))

  const whereClause = conditions.length ? and(...conditions) : undefined

  // Count query
  const countQuery = db.select({ count: sql`count(*)`.mapWith(Number) }).from(auditLog)
  const [{ count }] = whereClause
    ? await countQuery.where(whereClause)
    : await countQuery

  // Rows query
  const col = SORT_COLUMN_MAP[sortBy]
  const orderExpr = sortDir === 'asc' ? asc(col) : desc(col)
  const rowsQuery = db.select().from(auditLog)
  const filtered = whereClause ? rowsQuery.where(whereClause) : rowsQuery
  const rows = await filtered
    .orderBy(orderExpr)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return NextResponse.json({ events: rows, total: count, page, pageSize })
}

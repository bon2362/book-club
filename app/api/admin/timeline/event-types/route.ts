export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { asc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEventTypes, historicalEvents } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { eventTypeInputSchema, firstZodMessage, isUniqueViolation } from '@/lib/timeline/admin'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: historicalEventTypes.id,
      title: historicalEventTypes.title,
      color: historicalEventTypes.color,
      icon: historicalEventTypes.icon,
      usageCount: sql<number>`count(${historicalEvents.id})::int`,
    })
    .from(historicalEventTypes)
    .leftJoin(historicalEvents, eq(historicalEvents.eventTypeId, historicalEventTypes.id))
    .groupBy(historicalEventTypes.id)
    .orderBy(asc(historicalEventTypes.title))

  return NextResponse.json({ success: true, data: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })
  }

  const parsed = eventTypeInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  const id = crypto.randomUUID()
  try {
    await withAuditContext(
      {
        actorUserId: session.user.id,
        actorLabel: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
        reason: 'Создание типа события ленты времени',
      },
      async (tx) => tx.insert(historicalEventTypes).values({ id, ...parsed.data }),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'Тип с таким названием уже есть' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ success: true, data: { id, ...parsed.data, usageCount: 0 } })
}

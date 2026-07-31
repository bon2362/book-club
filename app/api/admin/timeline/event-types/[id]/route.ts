export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEventTypes, historicalEvents } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import {
  eventTypeInputSchema,
  eventsPlural,
  firstZodMessage,
  isUniqueViolation,
} from '@/lib/timeline/admin'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const [existing] = await db
    .select({ id: historicalEventTypes.id })
    .from(historicalEventTypes)
    .where(eq(historicalEventTypes.id, params.id))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Тип не найден' }, { status: 404 })

  try {
    await withAuditContext(
      {
        actorUserId: session.user.id,
        actorLabel: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
        reason: 'Правка типа события ленты времени',
      },
      async (tx) =>
        tx
          .update(historicalEventTypes)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(historicalEventTypes.id, params.id)),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'Тип с таким названием уже есть' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ success: true, data: { id: params.id, ...parsed.data } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Внешний ключ стоит ON DELETE RESTRICT: без этой проверки Postgres ответил
  // бы нарушением ограничения, а маршрут — пятисоткой.
  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(historicalEvents)
    .where(eq(historicalEvents.eventTypeId, params.id))

  const count = Number(usage?.count ?? 0)
  if (count > 0) {
    return NextResponse.json(
      { error: `Тип используется в ${count} ${eventsPlural(count)}. Сначала смените тип у этих событий.` },
      { status: 409 },
    )
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Удаление типа события ленты времени',
    },
    async (tx) => tx.delete(historicalEventTypes).where(eq(historicalEventTypes.id, params.id)),
  )

  return NextResponse.json({ success: true })
}

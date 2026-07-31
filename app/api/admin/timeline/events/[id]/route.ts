export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEventTypes, historicalEvents } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import {
  TimelineValidationError,
  assertEventDates,
  eventInputSchema,
  eventValues,
  firstZodMessage,
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

  const parsed = eventInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  try {
    assertEventDates(parsed.data)
  } catch (err) {
    if (err instanceof TimelineValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const [existing] = await db
    .select({ id: historicalEvents.id })
    .from(historicalEvents)
    .where(eq(historicalEvents.id, params.id))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 })

  const [type] = await db
    .select({ id: historicalEventTypes.id })
    .from(historicalEventTypes)
    .where(eq(historicalEventTypes.id, parsed.data.eventTypeId))
    .limit(1)
  if (!type) return NextResponse.json({ error: 'Такого типа события нет' }, { status: 400 })

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Правка события ленты времени',
    },
    async (tx) =>
      tx
        .update(historicalEvents)
        .set({ ...eventValues(parsed.data), updatedAt: new Date() })
        .where(eq(historicalEvents.id, params.id)),
  )

  return NextResponse.json({ success: true, data: { id: params.id, ...eventValues(parsed.data) } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Связи с таймлайнами уходят каскадом (`timeline_events` → ON DELETE CASCADE).
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Удаление события ленты времени',
    },
    async (tx) => tx.delete(historicalEvents).where(eq(historicalEvents.id, params.id)),
  )

  return NextResponse.json({ success: true })
}

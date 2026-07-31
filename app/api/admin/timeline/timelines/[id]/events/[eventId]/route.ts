export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEvents, timelineEvents, timelines } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { firstZodMessage } from '@/lib/timeline/admin'
import { eventMembershipSchema } from '@/lib/timeline/contents'

interface Context {
  params: { id: string; eventId: string }
}

/**
 * Включение события в ленту и правка его заметки.
 *
 * Один метод на оба случая: `PUT` идемпотентен по составному ключу
 * (`timeline_id`, `event_id`). Повторный вызов с теми же данными обновляет
 * заметку и не падает — экран сборки не обязан знать, включено событие уже или
 * ещё нет.
 */
export async function PUT(req: NextRequest, { params }: Context) {
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

  const parsed = eventMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  const [timeline] = await db
    .select({ id: timelines.id })
    .from(timelines)
    .where(eq(timelines.id, params.id))
    .limit(1)
  if (!timeline) return NextResponse.json({ error: 'Лента не найдена' }, { status: 404 })

  const [event] = await db
    .select({ id: historicalEvents.id })
    .from(historicalEvents)
    .where(eq(historicalEvents.id, params.eventId))
    .limit(1)
  if (!event) return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 })

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Включение события в ленту времени',
    },
    async (tx) =>
      tx
        .insert(timelineEvents)
        .values({ timelineId: params.id, eventId: params.eventId, note: parsed.data.note })
        .onConflictDoUpdate({
          target: [timelineEvents.timelineId, timelineEvents.eventId],
          set: { note: parsed.data.note, updatedAt: new Date() },
        }),
  )

  return NextResponse.json({
    success: true,
    data: { timelineId: params.id, eventId: params.eventId, note: parsed.data.note },
  })
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Само событие остаётся в общем справочнике — снимается только связь.
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Исключение события из ленты времени',
    },
    async (tx) =>
      tx
        .delete(timelineEvents)
        .where(
          and(
            eq(timelineEvents.timelineId, params.id),
            eq(timelineEvents.eventId, params.eventId),
          ),
        ),
  )

  return NextResponse.json({ success: true })
}

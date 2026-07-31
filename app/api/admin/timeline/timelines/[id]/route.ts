export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { timelines } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { firstZodMessage, timelinePublishSchema } from '@/lib/timeline/admin'

/**
 * Переключатель публикации ленты. Принимает только `{ published }`: остальные
 * настройки таймлайна (виды, фильтры, состав) — этап 5.
 */
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

  const parsed = timelinePublishSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  const [existing] = await db
    .select({ id: timelines.id })
    .from(timelines)
    .where(eq(timelines.id, params.id))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Лента не найдена' }, { status: 404 })

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: parsed.data.published ? 'Публикация ленты времени' : 'Снятие ленты с публикации',
    },
    async (tx) =>
      tx
        .update(timelines)
        .set({ published: parsed.data.published, updatedAt: new Date() })
        .where(eq(timelines.id, params.id)),
  )

  return NextResponse.json({ success: true, data: { id: params.id, published: parsed.data.published } })
}

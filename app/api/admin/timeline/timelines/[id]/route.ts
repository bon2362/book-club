export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { timelines } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { firstZodMessage, isUniqueViolation } from '@/lib/timeline/admin'
import { timelinePatchSchema } from '@/lib/timeline/contents'

/**
 * Правка ленты: название, адрес, описание и публикация.
 *
 * Все поля необязательны — кнопка публикации присылает только `published`,
 * форма — остальное. Пустое тело отвергается схемой.
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

  const parsed = timelinePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  const [existing] = await db
    .select({ id: timelines.id })
    .from(timelines)
    .where(eq(timelines.id, params.id))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Лента не найдена' }, { status: 404 })

  const changed = parsed.data
  const reason =
    changed.published === undefined
      ? 'Правка ленты времени'
      : changed.published
        ? 'Публикация ленты времени'
        : 'Снятие ленты с публикации'

  try {
    await withAuditContext(
      {
        actorUserId: session.user.id,
        actorLabel: session.user.name ?? session.user.contactEmail ?? null,
        source: 'admin',
        reason,
      },
      async (tx) =>
        tx
          .update(timelines)
          .set({ ...changed, updatedAt: new Date() })
          .where(eq(timelines.id, params.id)),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: `Адрес «${changed.slug}» уже занят другой лентой` },
        { status: 409 },
      )
    }
    throw err
  }

  return NextResponse.json({ success: true, data: { id: params.id, ...changed } })
}

/**
 * Удаление ленты. Убирается только подборка: события и эпохи остаются в общем
 * справочнике, связи уходят каскадом (`ON DELETE CASCADE` в миграции 0056).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Удаление ленты времени',
    },
    async (tx) => tx.delete(timelines).where(eq(timelines.id, params.id)),
  )

  return NextResponse.json({ success: true })
}

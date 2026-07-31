export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { timelines } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { firstZodMessage, isUniqueViolation } from '@/lib/timeline/admin'
import { timelineInputSchema } from '@/lib/timeline/contents'
import { fetchTimelineSummaries } from '@/lib/timeline/queries'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Админу нужны и черновики — публичный список их скрывает.
  const data = await fetchTimelineSummaries({ includeUnpublished: true })
  return NextResponse.json({ success: true, data })
}

/**
 * Создание ленты. Новая лента всегда черновик: публикация — отдельное решение
 * владельца, а состав ещё пуст.
 */
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

  const parsed = timelineInputSchema.safeParse(body)
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
        reason: 'Создание ленты времени',
      },
      async (tx) => tx.insert(timelines).values({ id, ...parsed.data, published: false }),
    )
  } catch (err) {
    // Уникальный индекс на slug: без явной проверки Postgres ответил бы 500.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: `Адрес «${parsed.data.slug}» уже занят другой лентой` },
        { status: 409 },
      )
    }
    throw err
  }

  return NextResponse.json({
    success: true,
    data: { id, ...parsed.data, published: false, eventCount: 0 },
  })
}

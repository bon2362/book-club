export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
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

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: historicalEvents.id,
      title: historicalEvents.title,
      eventTypeId: historicalEvents.eventTypeId,
      typeTitle: historicalEventTypes.title,
      typeColor: historicalEventTypes.color,
      typeIcon: historicalEventTypes.icon,
      startYear: historicalEvents.startYear,
      startEra: historicalEvents.startEra,
      startMonth: historicalEvents.startMonth,
      startDay: historicalEvents.startDay,
      endYear: historicalEvents.endYear,
      endEra: historicalEvents.endEra,
      endMonth: historicalEvents.endMonth,
      endDay: historicalEvents.endDay,
      ongoing: historicalEvents.ongoing,
      description: historicalEvents.description,
      imageUrl: historicalEvents.imageUrl,
      imageCaption: historicalEvents.imageCaption,
    })
    .from(historicalEvents)
    .innerJoin(historicalEventTypes, eq(historicalEventTypes.id, historicalEvents.eventTypeId))
    .orderBy(asc(historicalEvents.title))

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

  const [type] = await db
    .select({ id: historicalEventTypes.id })
    .from(historicalEventTypes)
    .where(eq(historicalEventTypes.id, parsed.data.eventTypeId))
    .limit(1)
  if (!type) return NextResponse.json({ error: 'Такого типа события нет' }, { status: 400 })

  const id = crypto.randomUUID()
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Создание события ленты времени',
    },
    async (tx) => tx.insert(historicalEvents).values({ id, ...eventValues(parsed.data) }),
  )

  return NextResponse.json({ success: true, data: { id, ...eventValues(parsed.data) } })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEpochs, timelineEpochs, timelines } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { TimelineValidationError, columnsToDate, firstZodMessage } from '@/lib/timeline/admin'
import { assertEpochLaneFree, epochMembershipSchema, type EpochLaneCandidate } from '@/lib/timeline/contents'
import type { HistoricalDate } from '@/lib/timeline'

interface Context {
  params: { id: string; epochId: string }
}

interface EpochDateColumns {
  id: string
  title: string
  startYear: number
  startEra: string
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endEra: string | null
  endMonth: number | null
  endDay: number | null
  pinnedLane?: number | null
}

/** Строка эпохи → вход проверки дорожек. Конец у эпохи в базе обязателен. */
function toCandidate(row: EpochDateColumns, pinnedLane: number | null): EpochLaneCandidate {
  const start = columnsToDate({
    year: row.startYear,
    era: row.startEra,
    month: row.startMonth,
    day: row.startDay,
  }) as HistoricalDate
  const end =
    columnsToDate({
      year: row.endYear,
      era: row.endEra,
      month: row.endMonth,
      day: row.endDay,
    }) ?? start

  return { id: row.id, title: row.title, start, end, pinnedLane }
}

/**
 * Включение эпохи в ленту и правка её оформления на этой ленте: заметка, цвет,
 * видимость и закреплённая дорожка.
 *
 * Идемпотентен так же, как маршрут событий. Перед записью проверяется, что
 * закреплённая дорожка свободна — иначе публичная лента нарисовала бы две
 * полосы одна поверх другой.
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

  const parsed = epochMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  const [timeline] = await db
    .select({ id: timelines.id })
    .from(timelines)
    .where(eq(timelines.id, params.id))
    .limit(1)
  if (!timeline) return NextResponse.json({ error: 'Лента не найдена' }, { status: 404 })

  const [epoch] = await db
    .select({
      id: historicalEpochs.id,
      title: historicalEpochs.title,
      startYear: historicalEpochs.startYear,
      startEra: historicalEpochs.startEra,
      startMonth: historicalEpochs.startMonth,
      startDay: historicalEpochs.startDay,
      endYear: historicalEpochs.endYear,
      endEra: historicalEpochs.endEra,
      endMonth: historicalEpochs.endMonth,
      endDay: historicalEpochs.endDay,
    })
    .from(historicalEpochs)
    .where(eq(historicalEpochs.id, params.epochId))
    .limit(1)
  if (!epoch) return NextResponse.json({ error: 'Эпоха не найдена' }, { status: 404 })

  if (parsed.data.pinnedLane != null) {
    const neighbours = await db
      .select({
        id: historicalEpochs.id,
        title: historicalEpochs.title,
        startYear: historicalEpochs.startYear,
        startEra: historicalEpochs.startEra,
        startMonth: historicalEpochs.startMonth,
        startDay: historicalEpochs.startDay,
        endYear: historicalEpochs.endYear,
        endEra: historicalEpochs.endEra,
        endMonth: historicalEpochs.endMonth,
        endDay: historicalEpochs.endDay,
        pinnedLane: timelineEpochs.pinnedLane,
      })
      .from(timelineEpochs)
      .innerJoin(historicalEpochs, eq(historicalEpochs.id, timelineEpochs.epochId))
      .where(
        and(
          eq(timelineEpochs.timelineId, params.id),
          ne(timelineEpochs.epochId, params.epochId),
        ),
      )

    try {
      assertEpochLaneFree(
        toCandidate(epoch, parsed.data.pinnedLane),
        neighbours.map((row) => toCandidate(row, row.pinnedLane)),
      )
    } catch (err) {
      if (err instanceof TimelineValidationError) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
      throw err
    }
  }

  const values = {
    note: parsed.data.note,
    color: parsed.data.color,
    visible: parsed.data.visible,
    pinnedLane: parsed.data.pinnedLane,
  }

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Включение эпохи в ленту времени',
    },
    async (tx) =>
      tx
        .insert(timelineEpochs)
        .values({ timelineId: params.id, epochId: params.epochId, ...values })
        .onConflictDoUpdate({
          target: [timelineEpochs.timelineId, timelineEpochs.epochId],
          set: { ...values, updatedAt: new Date() },
        }),
  )

  return NextResponse.json({
    success: true,
    data: { timelineId: params.id, epochId: params.epochId, ...values },
  })
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Сама эпоха остаётся в общем справочнике — снимается только связь.
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Исключение эпохи из ленты времени',
    },
    async (tx) =>
      tx
        .delete(timelineEpochs)
        .where(
          and(
            eq(timelineEpochs.timelineId, params.id),
            eq(timelineEpochs.epochId, params.epochId),
          ),
        ),
  )

  return NextResponse.json({ success: true })
}

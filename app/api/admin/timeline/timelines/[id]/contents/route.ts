export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  historicalEpochs,
  historicalEventTypes,
  historicalEvents,
  timelineEpochs,
  timelineEvents,
  timelines,
} from '@/lib/db/schema'

/**
 * Состав ленты одним запросом: сама лента, включённые события и эпохи со своими
 * заметками и оформлением, плюс то, что ещё **не** включено.
 *
 * Разделение на «в ленте» и «можно добавить» делается здесь, а не двумя
 * запросами из формы: экран сборки показывает обе колонки сразу, и второй
 * round-trip дал бы мигание между ними.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [timeline] = await db
    .select({
      id: timelines.id,
      slug: timelines.slug,
      title: timelines.title,
      description: timelines.description,
      published: timelines.published,
    })
    .from(timelines)
    .where(eq(timelines.id, params.id))
    .limit(1)

  if (!timeline) return NextResponse.json({ error: 'Лента не найдена' }, { status: 404 })

  const [allEvents, allEpochs, eventLinks, epochLinks] = await Promise.all([
    db
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
      .orderBy(asc(historicalEvents.title)),
    db
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
        description: historicalEpochs.description,
        imageUrl: historicalEpochs.imageUrl,
        imageCaption: historicalEpochs.imageCaption,
      })
      .from(historicalEpochs)
      .orderBy(asc(historicalEpochs.title)),
    db
      .select({
        eventId: timelineEvents.eventId,
        note: timelineEvents.note,
        visible: timelineEvents.visible,
      })
      .from(timelineEvents)
      .where(eq(timelineEvents.timelineId, params.id)),
    db
      .select({
        epochId: timelineEpochs.epochId,
        note: timelineEpochs.note,
        color: timelineEpochs.color,
        visible: timelineEpochs.visible,
        pinnedLane: timelineEpochs.pinnedLane,
      })
      .from(timelineEpochs)
      .where(eq(timelineEpochs.timelineId, params.id)),
  ])

  const eventLinkById = new Map(eventLinks.map((link) => [link.eventId, link]))
  const epochLinkById = new Map(epochLinks.map((link) => [link.epochId, link]))

  const events = []
  const availableEvents = []
  for (const row of allEvents) {
    const link = eventLinkById.get(row.id)
    if (link) events.push({ ...row, note: link.note, visible: link.visible })
    else availableEvents.push(row)
  }

  const epochs = []
  const availableEpochs = []
  for (const row of allEpochs) {
    const link = epochLinkById.get(row.id)
    if (link) {
      epochs.push({
        ...row,
        note: link.note,
        color: link.color,
        visible: link.visible,
        pinnedLane: link.pinnedLane,
      })
    } else {
      availableEpochs.push(row)
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      timeline: { ...timeline, eventCount: events.length },
      events,
      epochs,
      availableEvents,
      availableEpochs,
    },
  })
}

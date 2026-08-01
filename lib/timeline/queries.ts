import { db } from '@/lib/db'
import {
  historicalEpochs,
  historicalEventTypes,
  historicalEvents,
  timelineEpochs,
  timelineEvents,
  timelines,
} from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'
import {
  buildTimelineView,
  type TimelineEpochRow,
  type TimelineEventRow,
  type TimelineLibraryEpochRow,
  type TimelineLibraryEventRow,
  type TimelineRow,
  type TimelineSummary,
  type TimelineViewData,
} from './view-model'

/**
 * Чтение таймлайнов из базы. Сборка структуры для отрисовки вынесена в
 * `view-model.ts`, поэтому здесь только запросы.
 */

/**
 * Список таймлайнов с числом событий, отсортированный по названию.
 * По умолчанию отдаются только опубликованные; админской странице нужны и
 * черновики — для этого `includeUnpublished`.
 */
export async function fetchTimelineSummaries(
  options: { includeUnpublished?: boolean } = {},
): Promise<TimelineSummary[]> {
  const query = db
    .select({
      id: timelines.id,
      slug: timelines.slug,
      title: timelines.title,
      description: timelines.description,
      published: timelines.published,
      eventCount: sql<number>`count(${timelineEvents.eventId})::int`,
    })
    .from(timelines)
    .leftJoin(timelineEvents, eq(timelineEvents.timelineId, timelines.id))

  const filtered = options.includeUnpublished
    ? query
    : query.where(eq(timelines.published, true))

  return filtered
    .groupBy(timelines.id, timelines.slug, timelines.title, timelines.description, timelines.published)
    .orderBy(asc(timelines.title))
}

/** Только опубликованные таймлайны — то, что видит обычный посетитель. */
export function fetchPublishedTimelines(): Promise<TimelineSummary[]> {
  return fetchTimelineSummaries()
}

/**
 * Таймлайн по адресу вместе с событиями и эпохами.
 *
 * Фильтр по `published` здесь намеренно не зашит: страница решает сама, потому
 * что админу черновики показываются, а остальным — нет.
 */
export async function fetchTimelineBySlug(
  slug: string,
  options: { includeLibrary?: boolean } = {},
): Promise<TimelineViewData | null> {
  const timelineRows = await db
    .select({
      id: timelines.id,
      slug: timelines.slug,
      title: timelines.title,
      description: timelines.description,
      published: timelines.published,
      viewportStart: timelines.viewportStart,
      viewportEnd: timelines.viewportEnd,
      filterTypeIds: timelines.filterTypeIds,
      epochsVisible: timelines.epochsVisible,
      showAll: timelines.showAll,
    })
    .from(timelines)
    .where(eq(timelines.slug, slug))
    .limit(1)

  const timeline = timelineRows[0] as TimelineRow | undefined
  if (timeline === undefined) return null

  const [events, epochs] = await Promise.all([
    db
      .select({
        id: historicalEvents.id,
        title: historicalEvents.title,
        typeId: historicalEventTypes.id,
        typeTitle: historicalEventTypes.title,
        color: historicalEventTypes.color,
        icon: historicalEventTypes.icon,
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
        note: timelineEvents.note,
        visible: timelineEvents.visible,
      })
      .from(timelineEvents)
      .innerJoin(historicalEvents, eq(historicalEvents.id, timelineEvents.eventId))
      .innerJoin(historicalEventTypes, eq(historicalEventTypes.id, historicalEvents.eventTypeId))
      .where(eq(timelineEvents.timelineId, timeline.id)) as Promise<TimelineEventRow[]>,
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
        note: timelineEpochs.note,
        color: timelineEpochs.color,
        visible: timelineEpochs.visible,
        pinnedLane: timelineEpochs.pinnedLane,
      })
      .from(timelineEpochs)
      .innerJoin(historicalEpochs, eq(historicalEpochs.id, timelineEpochs.epochId))
      .where(eq(timelineEpochs.timelineId, timeline.id)) as Promise<TimelineEpochRow[]>,
  ])

  if (!options.includeLibrary) {
    return buildTimelineView({ timeline, events, epochs })
  }

  const [allEvents, allEpochs] = await Promise.all([
    db
      .select({
        id: historicalEvents.id,
        title: historicalEvents.title,
        typeId: historicalEventTypes.id,
        typeTitle: historicalEventTypes.title,
        color: historicalEventTypes.color,
        icon: historicalEventTypes.icon,
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
      .orderBy(asc(historicalEvents.title)) as Promise<TimelineLibraryEventRow[]>,
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
      .orderBy(asc(historicalEpochs.title)) as Promise<TimelineLibraryEpochRow[]>,
  ])
  const attachedEventIds = new Set(events.map(({ id }) => id))
  const attachedEpochIds = new Set(epochs.map(({ id }) => id))

  return buildTimelineView({
    timeline,
    events,
    epochs,
    libraryEvents: allEvents.filter(({ id }) => !attachedEventIds.has(id)),
    libraryEpochs: allEpochs.filter(({ id }) => !attachedEpochIds.has(id)),
  })
}

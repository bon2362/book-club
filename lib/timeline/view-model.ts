import { compareHistoricalDates, type HistoricalDate, type HistoricalEra } from './historical-date'

/**
 * Сборка плоских строк базы в структуру, которую рисует лента.
 *
 * Функции здесь чистые: к базе не обращаются, поэтому сборку можно проверить
 * тестами без подключения. Запросы живут в `queries.ts`.
 */

export interface TimelineSummary {
  id: string
  slug: string
  title: string
  description: string
  published: boolean
  eventCount: number
}

export interface TimelineEventView {
  id: string
  title: string
  typeId: string
  typeTitle: string
  /** Цвет типа события — приходит из данных (`historical_event_types.color`). */
  color: string
  icon: string
  start: HistoricalDate
  end?: HistoricalDate
  ongoing: boolean
  description: string
  imageUrl: string | null
  imageCaption: string | null
  /** Заметка, привязанная к событию именно в этом таймлайне. */
  note: string
}

export interface TimelineEpochView {
  id: string
  title: string
  start: HistoricalDate
  end: HistoricalDate
  description: string
  imageUrl: string | null
  imageCaption: string | null
  note: string
  /** Цвет эпохи берётся из связи: на разных таймлайнах он может отличаться. */
  color: string
  visible: boolean
  pinnedLane?: number
}

export interface TimelineViewData {
  id: string
  slug: string
  title: string
  description: string
  published: boolean
  viewportStart: number | null
  viewportEnd: number | null
  filterTypeIds: string[]
  epochsVisible: boolean
  showAll: boolean
  events: TimelineEventView[]
  epochs: TimelineEpochView[]
}

/** Строка `timelines`. */
export interface TimelineRow {
  id: string
  slug: string
  title: string
  description: string
  published: boolean
  viewportStart: number | null
  viewportEnd: number | null
  filterTypeIds: string[] | null
  epochsVisible: boolean
  showAll: boolean
}

/** Строка `timeline_events` вместе с событием и его типом. */
export interface TimelineEventRow {
  id: string
  title: string
  typeId: string
  typeTitle: string
  color: string
  icon: string
  startYear: number
  startEra: string
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endEra: string | null
  endMonth: number | null
  endDay: number | null
  ongoing: boolean
  description: string
  imageUrl: string | null
  imageCaption: string | null
  note: string
}

/** Строка `timeline_epochs` вместе с эпохой. */
export interface TimelineEpochRow {
  id: string
  title: string
  startYear: number
  startEra: string
  startMonth: number | null
  startDay: number | null
  endYear: number
  endEra: string
  endMonth: number | null
  endDay: number | null
  description: string
  imageUrl: string | null
  imageCaption: string | null
  note: string
  color: string
  visible: boolean
  pinnedLane: number | null
}

export interface TimelineViewRows {
  timeline: TimelineRow
  events: TimelineEventRow[]
  epochs: TimelineEpochRow[]
}

function era(value: string): HistoricalEra {
  return value === 'BCE' ? 'BCE' : 'CE'
}

/**
 * Собирает `HistoricalDate` из колонок. `null` в месяце и дне превращается в
 * отсутствующее поле, а не в `null`: `historicalDateSchema` объявлен `.strict()`
 * и `null` не принимает.
 */
function historicalDate(
  year: number,
  eraValue: string,
  month: number | null,
  day: number | null,
): HistoricalDate {
  const date: HistoricalDate = { year, era: era(eraValue) }
  if (month !== null) date.month = month
  if (day !== null && month !== null) date.day = day
  return date
}

function eventFromRow(row: TimelineEventRow): TimelineEventView {
  const start = historicalDate(row.startYear, row.startEra, row.startMonth, row.startDay)
  const end = row.endYear === null || row.endEra === null
    ? undefined
    : historicalDate(row.endYear, row.endEra, row.endMonth, row.endDay)

  return {
    id: row.id,
    title: row.title,
    typeId: row.typeId,
    typeTitle: row.typeTitle,
    color: row.color,
    icon: row.icon,
    start,
    ...(end === undefined ? {} : { end }),
    ongoing: row.ongoing,
    description: row.description,
    imageUrl: row.imageUrl,
    imageCaption: row.imageCaption,
    note: row.note,
  }
}

function epochFromRow(row: TimelineEpochRow): TimelineEpochView {
  return {
    id: row.id,
    title: row.title,
    start: historicalDate(row.startYear, row.startEra, row.startMonth, row.startDay),
    end: historicalDate(row.endYear, row.endEra, row.endMonth, row.endDay),
    description: row.description,
    imageUrl: row.imageUrl,
    imageCaption: row.imageCaption,
    note: row.note,
    color: row.color,
    visible: row.visible,
    ...(row.pinnedLane === null ? {} : { pinnedLane: row.pinnedLane }),
  }
}

/** Хронологический порядок: «до н. э.» раньше «н. э.», при равенстве — по названию. */
function byChronology(
  left: { start: HistoricalDate; title: string },
  right: { start: HistoricalDate; title: string },
): number {
  return (
    compareHistoricalDates(left.start, right.start) ||
    left.title.localeCompare(right.title, 'ru')
  )
}

export function buildTimelineView({ timeline, events, epochs }: TimelineViewRows): TimelineViewData {
  return {
    id: timeline.id,
    slug: timeline.slug,
    title: timeline.title,
    description: timeline.description,
    published: timeline.published,
    viewportStart: timeline.viewportStart,
    viewportEnd: timeline.viewportEnd,
    filterTypeIds: timeline.filterTypeIds ?? [],
    epochsVisible: timeline.epochsVisible,
    showAll: timeline.showAll,
    events: events.map(eventFromRow).sort(byChronology),
    // Невидимые эпохи остаются в наборе с флагом: показывать их или нет —
    // решение слоя отрисовки, а не сборки.
    epochs: epochs.map(epochFromRow).sort(byChronology),
  }
}

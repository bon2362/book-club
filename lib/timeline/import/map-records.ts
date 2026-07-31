import type {
  historicalEventTypes,
  historicalEvents,
  historicalEpochs,
  timelines,
  timelineEvents,
  timelineEpochs,
} from '@/lib/db/schema'
import { htmlToMarkdown } from './html-to-markdown'
import type {
  SqliteEpochRow,
  SqliteEventRow,
  SqliteEventTypeRow,
  SqliteImageRow,
  SqliteTimelineEpochRow,
  SqliteTimelineEventRow,
  SqliteTimelineRow,
} from './export-shape'

type NewEventType = typeof historicalEventTypes.$inferInsert
type NewEvent = typeof historicalEvents.$inferInsert
type NewEpoch = typeof historicalEpochs.$inferInsert
type NewTimeline = typeof timelines.$inferInsert
type NewTimelineEvent = typeof timelineEvents.$inferInsert
type NewTimelineEpoch = typeof timelineEpochs.$inferInsert

/**
 * Строит указатель «идентификатор изображения → адрес».
 * Загруженный файл лежит на локальном диске и в вебе его нет, поэтому такая
 * запись — не предупреждение, а остановка: молча потерять картинку хуже.
 */
export function buildImageUrlIndex(images: SqliteImageRow[]): Map<string, string> {
  const index = new Map<string, string>()

  for (const image of images) {
    if (image.source_type === 'upload') {
      throw new Error(
        `buildImageUrlIndex: изображение ${image.id} загружено файлом — ` +
        'перенос поддерживает только внешние адреса',
      )
    }
    index.set(image.id, image.source_value)
  }

  return index
}

function resolveImage(
  imageId: string | null,
  index: Map<string, string>,
): string | null {
  if (imageId === null) return null

  const url = index.get(imageId)
  if (url === undefined) {
    throw new Error(`resolveImage: изображение ${imageId} не найдено в выгрузке`)
  }

  return url
}

export function mapEventType(row: SqliteEventTypeRow): NewEventType {
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    icon: row.icon,
  }
}

export function mapEvent(row: SqliteEventRow, images: Map<string, string>): NewEvent {
  return {
    id: row.id,
    title: row.title,
    eventTypeId: row.event_type_id,
    startYear: row.start_year,
    startEra: row.start_era,
    startMonth: row.start_month,
    startDay: row.start_day,
    endYear: row.end_year,
    endEra: row.end_era,
    endMonth: row.end_month,
    endDay: row.end_day,
    ongoing: row.ongoing === 1,
    description: htmlToMarkdown(row.description_html),
    imageUrl: resolveImage(row.image_id, images),
    imageCaption: row.image_caption,
  }
}

export function mapEpoch(row: SqliteEpochRow, images: Map<string, string>): NewEpoch {
  return {
    id: row.id,
    title: row.title,
    startYear: row.start_year,
    startEra: row.start_era,
    startMonth: row.start_month,
    startDay: row.start_day,
    endYear: row.end_year,
    endEra: row.end_era,
    endMonth: row.end_month,
    endDay: row.end_day,
    description: htmlToMarkdown(row.description_html),
    imageUrl: resolveImage(row.image_id, images),
    imageCaption: row.image_caption,
  }
}

function parseFilterTypeIds(json: string): string[] {
  const parsed: unknown = JSON.parse(json)

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`mapTimeline: filter_type_ids_json не является списком строк: ${json}`)
  }

  return parsed as string[]
}

/**
 * Slug приходит аргументом, а не вычисляется: переносимых таймлайнов два,
 * а дальше адрес будет вводиться руками в форме.
 * `published` для всех переносимых — false: публикация делается осознанно,
 * после проверки глазами.
 */
export function mapTimeline(row: SqliteTimelineRow, slug: string): NewTimeline {
  return {
    id: row.id,
    slug,
    title: row.title,
    description: row.description,
    published: false,
    viewportStart: row.viewport_start,
    viewportEnd: row.viewport_end,
    filterTypeIds: parseFilterTypeIds(row.filter_type_ids_json),
    epochsVisible: row.epochs_visible === 1,
    showAll: row.show_all === 1,
  }
}

export function mapTimelineEvent(row: SqliteTimelineEventRow): NewTimelineEvent {
  return {
    timelineId: row.timeline_id,
    eventId: row.event_id,
    note: htmlToMarkdown(row.local_note_html),
  }
}

export function mapTimelineEpoch(row: SqliteTimelineEpochRow): NewTimelineEpoch {
  return {
    timelineId: row.timeline_id,
    epochId: row.epoch_id,
    note: htmlToMarkdown(row.local_note_html),
    color: row.color,
    visible: row.visible === 1,
    pinnedLane: row.pinned_lane,
  }
}

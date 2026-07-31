import { z } from 'zod'

const era = z.enum(['BCE', 'CE'])
const sqliteBoolean = z.union([z.literal(0), z.literal(1)])

export const sqliteImageRowSchema = z.object({
  id: z.string(),
  source_type: z.enum(['upload', 'external']),
  source_value: z.string(),
})

export const sqliteEventTypeRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  color: z.string(),
  icon: z.string(),
})

export const sqliteEventRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  event_type_id: z.string(),
  start_year: z.number().int(),
  start_era: era,
  start_month: z.number().int().nullable(),
  start_day: z.number().int().nullable(),
  end_year: z.number().int().nullable(),
  end_era: era.nullable(),
  end_month: z.number().int().nullable(),
  end_day: z.number().int().nullable(),
  ongoing: sqliteBoolean,
  description_html: z.string(),
  image_id: z.string().nullable(),
  image_caption: z.string().nullable(),
})

export const sqliteEpochRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_year: z.number().int(),
  start_era: era,
  start_month: z.number().int().nullable(),
  start_day: z.number().int().nullable(),
  end_year: z.number().int(),
  end_era: era,
  end_month: z.number().int().nullable(),
  end_day: z.number().int().nullable(),
  description_html: z.string(),
  image_id: z.string().nullable(),
  image_caption: z.string().nullable(),
})

export const sqliteTimelineRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  viewport_start: z.number().nullable(),
  viewport_end: z.number().nullable(),
  filter_type_ids_json: z.string(),
  epochs_visible: sqliteBoolean,
  show_all: sqliteBoolean,
})

export const sqliteTimelineEventRowSchema = z.object({
  timeline_id: z.string(),
  event_id: z.string(),
  local_note_html: z.string(),
})

export const sqliteTimelineEpochRowSchema = z.object({
  timeline_id: z.string(),
  epoch_id: z.string(),
  local_note_html: z.string(),
  color: z.string(),
  visible: sqliteBoolean,
  pinned_lane: z.number().int().nullable(),
})

export const sqliteExportSchema = z.object({
  images: z.array(sqliteImageRowSchema),
  eventTypes: z.array(sqliteEventTypeRowSchema),
  events: z.array(sqliteEventRowSchema),
  epochs: z.array(sqliteEpochRowSchema),
  timelines: z.array(sqliteTimelineRowSchema),
  timelineEvents: z.array(sqliteTimelineEventRowSchema),
  timelineEpochs: z.array(sqliteTimelineEpochRowSchema),
})

export type SqliteExport = z.infer<typeof sqliteExportSchema>
export type SqliteImageRow = z.infer<typeof sqliteImageRowSchema>
export type SqliteEventTypeRow = z.infer<typeof sqliteEventTypeRowSchema>
export type SqliteEventRow = z.infer<typeof sqliteEventRowSchema>
export type SqliteEpochRow = z.infer<typeof sqliteEpochRowSchema>
export type SqliteTimelineRow = z.infer<typeof sqliteTimelineRowSchema>
export type SqliteTimelineEventRow = z.infer<typeof sqliteTimelineEventRowSchema>
export type SqliteTimelineEpochRow = z.infer<typeof sqliteTimelineEpochRowSchema>

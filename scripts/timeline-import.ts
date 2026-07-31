// Одноразовый перенос выгрузки JSON в Postgres.
//
//   npx tsx scripts/timeline-import.ts /tmp/timeline-export.json
//
// DATABASE_URL берётся из окружения. Скрипт отказывается работать, если в
// целевых таблицах уже есть строки — защита от повторного прогона по проду.
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  historicalEventTypes,
  historicalEvents,
  historicalEpochs,
  timelines,
  timelineEvents,
  timelineEpochs,
} from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { sqliteExportSchema } from '@/lib/timeline/import/export-shape'
import {
  buildImageUrlIndex,
  mapEpoch,
  mapEvent,
  mapEventType,
  mapTimeline,
  mapTimelineEpoch,
  mapTimelineEvent,
} from '@/lib/timeline/import/map-records'

/** Адреса переносимых таймлайнов. Записей две — таблица явная, без транслитерации. */
const SLUG_BY_TITLE: Record<string, string> = {
  'Всеобщая история': 'vseobschaya-istoriya',
  'Заря всего': 'zarya-vsego',
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function main() {
  const file = process.argv[2]
  if (!file) fail('Usage: npx tsx scripts/timeline-import.ts <path/to/export.json>')
  if (!process.env.DATABASE_URL) fail('DATABASE_URL не задан')

  const parsed = sqliteExportSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success) {
    fail(`Выгрузка не прошла проверку формы:\n${JSON.stringify(parsed.error.issues, null, 2)}`)
  }
  const data = parsed.data

  // Отказ при непустых таблицах — до любой записи.
  const targets = [
    ['historical_event_types', historicalEventTypes],
    ['historical_events', historicalEvents],
    ['historical_epochs', historicalEpochs],
    ['timelines', timelines],
    ['timeline_events', timelineEvents],
    ['timeline_epochs', timelineEpochs],
  ] as const

  const occupied: string[] = []
  for (const [name, table] of targets) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table)
    if ((row?.count ?? 0) > 0) occupied.push(`${name}: ${row!.count}`)
  }
  if (occupied.length > 0) {
    fail(
      'Отказ: целевые таблицы не пусты, повторный импорт запрещён.\n' +
      occupied.map((line) => `  ${line}`).join('\n'),
    )
  }

  const images = buildImageUrlIndex(data.images)

  const slugFor = (title: string): string => {
    const slug = SLUG_BY_TITLE[title]
    if (!slug) throw new Error(`Не задан slug для таймлайна «${title}» — дополните SLUG_BY_TITLE`)
    return slug
  }

  await withAuditContext(
    { source: 'system', actorUserId: null, reason: 'timeline sqlite import' },
    async (tx) => {
      // Порядок важен: внешние ключи.
      await tx.insert(historicalEventTypes).values(data.eventTypes.map(mapEventType))
      await tx.insert(historicalEvents).values(data.events.map((row) => mapEvent(row, images)))
      await tx.insert(historicalEpochs).values(data.epochs.map((row) => mapEpoch(row, images)))
      await tx.insert(timelines).values(
        data.timelines.map((row) => mapTimeline(row, slugFor(row.title))),
      )
      if (data.timelineEvents.length > 0) {
        await tx.insert(timelineEvents).values(data.timelineEvents.map(mapTimelineEvent))
      }
      if (data.timelineEpochs.length > 0) {
        await tx.insert(timelineEpochs).values(data.timelineEpochs.map(mapTimelineEpoch))
      }
    },
  )

  console.log('Перенесено:')
  console.log(`  historical_event_types: ${data.eventTypes.length}`)
  console.log(`  historical_events:      ${data.events.length}`)
  console.log(`  historical_epochs:      ${data.epochs.length}`)
  console.log(`  timelines:              ${data.timelines.length}`)
  console.log(`  timeline_events:        ${data.timelineEvents.length}`)
  console.log(`  timeline_epochs:        ${data.timelineEpochs.length}`)
  console.log('Все таймлайны перенесены неопубликованными (published = false).')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

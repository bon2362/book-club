// Одноразовая выгрузка локальной базы таймлайнов в JSON.
//
// Формат CommonJS выбран намеренно: better-sqlite3 установлен только в
// проекте-источнике, и подключить его получится через NODE_PATH, который
// работает для require, но игнорируется модулями ESM.
//
// Запускать из проекта-источника:
//
//   cd /Users/ekoshkin/documents/timeline
//   NODE_PATH="$PWD/node_modules" node <путь-к-book-club>/scripts/timeline-export.cjs \
//     data/timeline.sqlite > /tmp/timeline-export.json
const Database = require('better-sqlite3')

const file = process.argv[2]
if (!file) {
  console.error('Usage: node timeline-export.cjs <path/to/timeline.sqlite>')
  process.exit(1)
}

const db = new Database(file, { readonly: true })
const all = (sql) => db.prepare(sql).all()

const payload = {
  images: all('SELECT id, source_type, source_value FROM images'),
  eventTypes: all('SELECT id, title, color, icon FROM event_types'),
  events: all(`SELECT id, title, event_type_id, start_year, start_era, start_month, start_day,
                      end_year, end_era, end_month, end_day, ongoing, description_html,
                      image_id, image_caption
               FROM events`),
  epochs: all(`SELECT id, title, start_year, start_era, start_month, start_day,
                      end_year, end_era, end_month, end_day, description_html,
                      image_id, image_caption
               FROM epochs`),
  timelines: all(`SELECT id, title, description, viewport_start, viewport_end,
                         filter_type_ids_json, epochs_visible, show_all
                  FROM timelines`),
  timelineEvents: all('SELECT timeline_id, event_id, local_note_html FROM timeline_events'),
  timelineEpochs: all(`SELECT timeline_id, epoch_id, local_note_html, color, visible, pinned_lane
                       FROM timeline_epochs`),
}

process.stdout.write(JSON.stringify(payload, null, 2))
console.error(
  `Выгружено: типов ${payload.eventTypes.length}, событий ${payload.events.length}, ` +
  `эпох ${payload.epochs.length}, таймлайнов ${payload.timelines.length}, ` +
  `связей ${payload.timelineEvents.length + payload.timelineEpochs.length}`,
)

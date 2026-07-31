# Timeline, этап 2: схема данных и перенос из SQLite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать в Neon Postgres шесть таблиц раздела Timeline и перенести в них
накопленные данные из локального SQLite: 3 типа события, 30 событий, 14 эпох,
2 таймлайна и 50 связей.

**Architecture:** Схема описывается в `lib/db/schema.ts` (Drizzle) и применяется
SQL-миграцией `drizzle/0056_timeline_tables.sql`, которая в том же файле вешает
аудит-триггеры. Перенос данных — два скрипта: экспорт SQLite → JSON (запускается
из локального проекта, где есть `better-sqlite3`) и импорт JSON → Postgres
(запускается из этого репозитория через `withAuditContext`). Чистые функции
преобразования — конвертер HTML→markdown и маппинг строк — лежат в
`lib/timeline/import/` и покрыты unit-тестами.

**Tech Stack:** Drizzle ORM, Neon Postgres, tsx, cheerio, Jest.

**Спецификация:** `docs/superpowers/specs/2026-07-31-timeline-section-design.md`
**Предыдущий этап:** `docs/superpowers/plans/2026-07-31-timeline-stage-0-1-core.md` (выполнен, PR #502)

## Global Constraints

- Пользовательского интерфейса на этом этапе не появляется: ни страниц, ни API-маршрутов.
- Следующий свободный номер миграции — **0056** (последняя занятая — `0055_release_closed_matching_signup_guard.sql`).
- Все шесть таблиц обязаны попасть в `AUDITED_TABLES` (`lib/audit/audited-tables.ts`) **и** получить триггер в миграции. Тест `drizzle/0040_audit_triggers.test.ts` проверяет синхронность реестра и триггеров по всем файлам `drizzle/*.sql` — он упадёт, если добавить таблицу в реестр без триггера.
- Чувствительных колонок (токенов, хэшей, секретов, PII) в новых таблицах нет, поэтому маскирование в `audit_capture()` не трогается.
- Все записи в базу — только через `withAuditContext` (`lib/audit/with-audit-context.ts`), иначе падает ESLint. Для импорта: `source: 'system'`, `actorUserId: null`.
- Миграция применяется существующим раннером: `node scripts/apply-migration.mjs drizzle/0056_timeline_tables.sql` — так это описано в `docs/wiki/Operations-Runbook.md` для предыдущих миграций. Отдельного npm-скрипта нет.
- `tsx` **не** входит в зависимости проекта. Все `.ts`-скрипты запускаются через `npx tsx <файл>` — сложившаяся в репозитории практика. Писать в командах голое `tsx` нельзя, команда не найдётся.
- Vercel миграции не применяет: после мержа их выполняют вручную по продовой базе.
- Тесты рядом с кодом, `jest.config.ts` держит порог покрытия 80% строк и функций на `lib/**`.
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test`.
- Работа — в отдельном worktree от свежего `origin/main`, изменения через PR с автомержем.
- E2E не нужны: пользовательского поведения не появляется.
- **Wiki нужна:** этап меняет схему БД и связи данных — это прямое основание из CLAUDE.md.

## Что выяснено о данных источника

Проверено чтением `data/timeline.sqlite` 31.07.2026. Эти факты определили
несколько решений ниже — если данные с тех пор изменились, счётчики в отчёте
импорта разойдутся с ожидаемыми, и это нормально.

| Факт | Следствие для плана |
|---|---|
| Обе картинки имеют `source_type = 'external'`, загруженных файлов нет | Отказ от таблицы `images` безопасен: адрес копируется в колонку как есть, хостить нечего |
| Картинки есть у 2 событий, у эпох нет ни одной | Колонки `image_url`/`image_caption` нужны обеим таблицам, но данных для эпох не будет |
| В описаниях встречаются ровно пять HTML-тегов: `a`, `li`, `p`, `strong`, `ul` | Конвертер пишется под этот набор, а не под произвольный HTML. На неизвестном теге — падать, а не молча терять текст |
| Непустых описаний 30 из 44 | Пустая строка — валидное значение, не ошибка |
| Все 50 локальных заметок пустые | Колонка `note` создаётся, но конвертировать в ней нечего |
| 2 события «продолжаются», 12 с датой окончания, 1 до н. э. | Все три ветки маппинга дат встречаются в реальных данных и должны быть покрыты тестами |

Счётчики на момент составления плана: `event_types` 3, `events` 30, `epochs` 14,
`timelines` 2, `timeline_events` 35, `timeline_epochs` 15, `images` 2.

## Решения по схеме

**Что переносится из исходной схемы без изменений:** идентификаторы (UUID
строкой), поля дат (год, эра, месяц, день — отдельными колонками для начала и
конца), признак «продолжается», цвет и иконка типа, цвет и видимость эпохи на
таймлайне, закреплённая дорожка.

**Что меняется:**

| Исходник | Здесь | Почему |
|---|---|---|
| Таблица `images` + `image_id` | Колонки `image_url`, `image_caption` | Обе картинки внешние, хранилища файлов не будет (см. спецификацию) |
| `description_html` | `description` (markdown) | В проекте markdown повсюду |
| `local_note_html` | `note` (markdown) | То же |
| — | `timelines.slug`, `timelines.published` | Нужны для публичных ссылок |
| `divider_ratio` | не переносится | Разделитель панелей с перетаскиванием не портируется |
| `selected_item_kind`, `selected_item_id` | не переносится | Состояние редактора, публичной странице не нужно |
| `version` | не переносится | Оптимистичная блокировка нужна многопользовательскому редактированию; редактор здесь один |

`viewport_start`, `viewport_end`, `filter_type_ids`, `epochs_visible`,
`show_all` — переносятся: они задают, в каком месте и с какими фильтрами
откроется публичная страница на этапе 3.

**Slug для существующих таймлайнов** проставляется скриптом импорта явной
таблицей соответствия: «Всеобщая история» → `vseobschaya-istoriya`, «Заря
всего» → `zarya-vsego`. Автотранслитерация здесь не нужна — записей две, а на
этапе 4 slug будет вводиться руками в форме.

---

## File Structure

Создаётся:

```
drizzle/0056_timeline_tables.sql        — шесть таблиц + шесть аудит-триггеров
drizzle/0056_timeline_tables.test.ts    — проверка состава миграции
lib/timeline/import/
  html-to-markdown.ts                   — конвертер под пять тегов Tiptap
  html-to-markdown.test.ts
  map-records.ts                        — строки экспорта → строки Postgres
  map-records.test.ts
  export-shape.ts                       — zod-схемы JSON-выгрузки
scripts/timeline-export.cjs             — SQLite → JSON (запускается из проекта-источника)
scripts/timeline-import.ts              — JSON → Postgres
docs/features/timeline.md               — техническое описание раздела
```

Изменяется:

```
lib/db/schema.ts                        — +6 таблиц в конец файла
lib/audit/audited-tables.ts             — +6 имён в AUDITED_TABLES
docs/wiki/<файл раздела>                — описание фичи для владельца
```

**Почему `import/` отдельной папкой:** конвертер и маппинг — одноразовый код
переноса. Отделённые от `lib/timeline/geometry/` (постоянного расчётного ядра),
они не мешают читать основную логику и их можно будет удалить после переноса,
не разбираясь, что ещё от них зависит.

---

### Task 1: Схема, миграция и аудит

**Files:**
- Modify: `lib/db/schema.ts` (добавление в конец файла)
- Modify: `lib/audit/audited-tables.ts`
- Create: `drizzle/0056_timeline_tables.sql`
- Create: `drizzle/0056_timeline_tables.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: экспорты Drizzle `historicalEventTypes`, `historicalEvents`,
  `historicalEpochs`, `timelines`, `timelineEvents`, `timelineEpochs`.

- [ ] **Шаг 1: Создать рабочую папку**

```bash
git fetch origin main
git worktree add ../book-club-timeline-schema -b feat/timeline-schema origin/main
cd ../book-club-timeline-schema
ln -s ../book-club/node_modules node_modules
```

- [ ] **Шаг 2: Добавить таблицы в `lib/db/schema.ts`**

Дописать в конец файла. Импорты `pgTable`, `text`, `timestamp`, `integer`,
`boolean`, `primaryKey`, `index`, `uniqueIndex`, `jsonb`, `check` уже есть в
шапке файла; `doublePrecision` нужно добавить в существующий список импортов из
`drizzle-orm/pg-core`.

```ts
export const historicalEventTypes = pgTable('historical_event_types', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleLowerUnique: uniqueIndex('historical_event_types_title_lower_idx').on(sql`lower(${t.title})`),
}))

export const historicalEvents = pgTable('historical_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  eventTypeId: text('event_type_id').notNull()
    .references(() => historicalEventTypes.id, { onDelete: 'restrict' }),
  startYear: integer('start_year').notNull(),
  startEra: text('start_era').notNull(),
  startMonth: integer('start_month'),
  startDay: integer('start_day'),
  endYear: integer('end_year'),
  endEra: text('end_era'),
  endMonth: integer('end_month'),
  endDay: integer('end_day'),
  ongoing: boolean('ongoing').notNull().default(false),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleIdx: index('historical_events_title_idx').on(t.title),
  typeIdx: index('historical_events_type_idx').on(t.eventTypeId),
}))

export const historicalEpochs = pgTable('historical_epochs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  startYear: integer('start_year').notNull(),
  startEra: text('start_era').notNull(),
  startMonth: integer('start_month'),
  startDay: integer('start_day'),
  endYear: integer('end_year').notNull(),
  endEra: text('end_era').notNull(),
  endMonth: integer('end_month'),
  endDay: integer('end_day'),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  imageCaption: text('image_caption'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  titleIdx: index('historical_epochs_title_idx').on(t.title),
}))

export const timelines = pgTable('timelines', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  published: boolean('published').notNull().default(false),
  viewportStart: doublePrecision('viewport_start'),
  viewportEnd: doublePrecision('viewport_end'),
  filterTypeIds: jsonb('filter_type_ids').$type<string[]>().notNull().default([]),
  epochsVisible: boolean('epochs_visible').notNull().default(true),
  showAll: boolean('show_all').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('timelines_slug_unique').on(t.slug),
  publishedIdx: index('timelines_published_idx').on(t.published),
}))

export const timelineEvents = pgTable('timeline_events', {
  timelineId: text('timeline_id').notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull()
    .references(() => historicalEvents.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.timelineId, t.eventId] }),
  eventIdx: index('timeline_events_event_idx').on(t.eventId),
}))

export const timelineEpochs = pgTable('timeline_epochs', {
  timelineId: text('timeline_id').notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  epochId: text('epoch_id').notNull()
    .references(() => historicalEpochs.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  color: text('color').notNull(),
  visible: boolean('visible').notNull().default(true),
  pinnedLane: integer('pinned_lane'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.timelineId, t.epochId] }),
  epochIdx: index('timeline_epochs_epoch_idx').on(t.epochId),
}))
```

- [ ] **Шаг 3: Написать миграцию `drizzle/0056_timeline_tables.sql`**

Ограничения-проверки повторяют те, что были в SQLite: год строго положительный,
эра из двух значений, день только вместе с месяцем, конец интервала либо задан
полностью, либо отсутствует, «продолжается» несовместимо с датой окончания.

```sql
CREATE TABLE "historical_event_types" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_event_types_title_lower_idx" ON "historical_event_types" (lower("title"));
--> statement-breakpoint
CREATE TABLE "historical_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"event_type_id" text NOT NULL,
	"start_year" integer NOT NULL,
	"start_era" text NOT NULL,
	"start_month" integer,
	"start_day" integer,
	"end_year" integer,
	"end_era" text,
	"end_month" integer,
	"end_day" integer,
	"ongoing" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "historical_events_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "historical_event_types"("id") ON DELETE RESTRICT,
	CONSTRAINT "historical_events_start_year_check" CHECK ("start_year" > 0),
	CONSTRAINT "historical_events_start_era_check" CHECK ("start_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_events_start_month_check" CHECK ("start_month" IS NULL OR "start_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_events_start_day_check" CHECK ("start_day" IS NULL OR ("start_month" IS NOT NULL AND "start_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_events_end_year_check" CHECK ("end_year" IS NULL OR "end_year" > 0),
	CONSTRAINT "historical_events_end_era_check" CHECK ("end_era" IS NULL OR "end_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_events_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_events_end_day_check" CHECK ("end_day" IS NULL OR ("end_month" IS NOT NULL AND "end_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_events_end_complete_check" CHECK (
		("end_year" IS NULL AND "end_era" IS NULL AND "end_month" IS NULL AND "end_day" IS NULL)
		OR ("end_year" IS NOT NULL AND "end_era" IS NOT NULL)
	),
	CONSTRAINT "historical_events_ongoing_check" CHECK (NOT ("ongoing" AND "end_year" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "historical_events_title_idx" ON "historical_events" ("title");
--> statement-breakpoint
CREATE INDEX "historical_events_type_idx" ON "historical_events" ("event_type_id");
--> statement-breakpoint
CREATE TABLE "historical_epochs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"start_year" integer NOT NULL,
	"start_era" text NOT NULL,
	"start_month" integer,
	"start_day" integer,
	"end_year" integer NOT NULL,
	"end_era" text NOT NULL,
	"end_month" integer,
	"end_day" integer,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "historical_epochs_start_year_check" CHECK ("start_year" > 0),
	CONSTRAINT "historical_epochs_end_year_check" CHECK ("end_year" > 0),
	CONSTRAINT "historical_epochs_start_era_check" CHECK ("start_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_epochs_end_era_check" CHECK ("end_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_epochs_start_month_check" CHECK ("start_month" IS NULL OR "start_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_epochs_start_day_check" CHECK ("start_day" IS NULL OR ("start_month" IS NOT NULL AND "start_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_epochs_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_epochs_end_day_check" CHECK ("end_day" IS NULL OR ("end_month" IS NOT NULL AND "end_day" BETWEEN 1 AND 31))
);
--> statement-breakpoint
CREATE INDEX "historical_epochs_title_idx" ON "historical_epochs" ("title");
--> statement-breakpoint
CREATE TABLE "timelines" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"viewport_start" double precision,
	"viewport_end" double precision,
	"filter_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"epochs_visible" boolean DEFAULT true NOT NULL,
	"show_all" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timelines_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "timelines_slug_unique" ON "timelines" ("slug");
--> statement-breakpoint
CREATE INDEX "timelines_published_idx" ON "timelines" ("published");
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"timeline_id" text NOT NULL,
	"event_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_events_pk" PRIMARY KEY ("timeline_id", "event_id"),
	CONSTRAINT "timeline_events_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "timelines"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "historical_events"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "timeline_events_event_idx" ON "timeline_events" ("event_id");
--> statement-breakpoint
CREATE TABLE "timeline_epochs" (
	"timeline_id" text NOT NULL,
	"epoch_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"pinned_lane" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_epochs_pk" PRIMARY KEY ("timeline_id", "epoch_id"),
	CONSTRAINT "timeline_epochs_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "timelines"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_epochs_epoch_id_fk" FOREIGN KEY ("epoch_id") REFERENCES "historical_epochs"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_epochs_pinned_lane_check" CHECK ("pinned_lane" IS NULL OR "pinned_lane" >= 0)
);
--> statement-breakpoint
CREATE INDEX "timeline_epochs_epoch_idx" ON "timeline_epochs" ("epoch_id");
--> statement-breakpoint
CREATE TRIGGER audit_historical_event_types AFTER INSERT OR UPDATE OR DELETE ON "historical_event_types" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_historical_events AFTER INSERT OR UPDATE OR DELETE ON "historical_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_historical_epochs AFTER INSERT OR UPDATE OR DELETE ON "historical_epochs" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timelines AFTER INSERT OR UPDATE OR DELETE ON "timelines" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timeline_events AFTER INSERT OR UPDATE OR DELETE ON "timeline_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timeline_epochs AFTER INSERT OR UPDATE OR DELETE ON "timeline_epochs" FOR EACH ROW EXECUTE FUNCTION audit_capture();
```

- [ ] **Шаг 4: Зарегистрировать таблицы в аудите**

В `lib/audit/audited-tables.ts` добавить в конец массива `AUDITED_TABLES`
(перед `] as const`):

```ts
  'historical_event_types',
  'historical_events',
  'historical_epochs',
  'timelines',
  'timeline_events',
  'timeline_epochs',
```

`AUTH_OOB_TABLES` и `SYSTEM_TRIGGER_TABLES` не трогать: записи от скрипта
импорта пойдут с `source: 'system'` через `withAuditContext`, а не мимо него.

- [ ] **Шаг 5: Написать тест миграции**

Создать `drizzle/0056_timeline_tables.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0056 timeline tables migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0056_timeline_tables.sql'), 'utf8')

  const tables = [
    'historical_event_types',
    'historical_events',
    'historical_epochs',
    'timelines',
    'timeline_events',
    'timeline_epochs',
  ]

  it.each(tables)('creates the %s table', (table) => {
    expect(sql).toContain(`CREATE TABLE "${table}"`)
  })

  it.each(tables)('registers %s in the audit registry', (table) => {
    expect(AUDITED_TABLES).toContain(table)
  })

  it('keeps the slug unique and shaped like a URL segment', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "timelines_slug_unique"')
    expect(sql).toContain('timelines_slug_format_check')
  })

  it('forbids an ongoing event that also has an end year', () => {
    expect(sql).toContain('CHECK (NOT ("ongoing" AND "end_year" IS NOT NULL))')
  })

  it('cascades membership rows when a timeline is deleted', () => {
    expect(sql).toContain('REFERENCES "timelines"("id") ON DELETE CASCADE')
  })

  it('keeps an event type in use from being deleted', () => {
    expect(sql).toContain('REFERENCES "historical_event_types"("id") ON DELETE RESTRICT')
  })
})
```

- [ ] **Шаг 6: Запустить тесты миграции и аудита**

Выполнить: `npx jest drizzle/0056_timeline_tables drizzle/0040_audit_triggers --verbose`
Ожидается: все зелёные. Тест `attaches a trigger to every audited table` из
`0040` — главный: он подтверждает, что реестр и триггеры сошлись.

- [ ] **Шаг 7: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/db/schema.ts lib/audit/audited-tables.ts drizzle/0056_timeline_tables.sql drizzle/0056_timeline_tables.test.ts
git commit -m "feat: схема шести таблиц раздела Timeline

E2E: не нужен — пользовательского поведения не появляется.
Wiki: нужна — меняется схема БД; правка идёт в задаче 3 этого плана."
```

---

### Task 2: Конвертер HTML→markdown и маппинг записей

**Files:**
- Create: `lib/timeline/import/export-shape.ts`
- Create: `lib/timeline/import/html-to-markdown.ts`
- Create: `lib/timeline/import/html-to-markdown.test.ts`
- Create: `lib/timeline/import/map-records.ts`
- Create: `lib/timeline/import/map-records.test.ts`

**Interfaces:**
- Consumes: ничего из задачи 1 (чистые функции, к базе не обращаются).
- Produces:
  - `htmlToMarkdown(html: string): string`
  - `SqliteExport` — тип разобранной JSON-выгрузки
  - `sqliteExportSchema: z.ZodType<SqliteExport>`
  - `mapEventType(row: SqliteEventTypeRow): NewHistoricalEventType`
  - `mapEvent(row: SqliteEventRow, imageUrlById: Map<string, string>): NewHistoricalEvent`
  - `mapEpoch(row: SqliteEpochRow, imageUrlById: Map<string, string>): NewHistoricalEpoch`
  - `mapTimeline(row: SqliteTimelineRow, slug: string): NewTimeline`

- [ ] **Шаг 1: Написать провальный тест конвертера**

Создать `lib/timeline/import/html-to-markdown.test.ts`:

```ts
import { htmlToMarkdown } from './html-to-markdown'

describe('htmlToMarkdown', () => {
  it('returns an empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })

  it('unwraps a paragraph into a bare line', () => {
    expect(htmlToMarkdown('<p>Просто текст</p>')).toBe('Просто текст')
  })

  it('separates paragraphs with a blank line', () => {
    expect(htmlToMarkdown('<p>Первый</p><p>Второй</p>')).toBe('Первый\n\nВторой')
  })

  it('converts a link to markdown, keeping the href', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">Тут</a></p>'))
      .toBe('[Тут](https://example.com)')
  })

  it('drops rel and target attributes the editor added', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">Тут</a></p>'))
      .toBe('[Тут](https://example.com)')
  })

  it('converts strong to double asterisks', () => {
    expect(htmlToMarkdown('<p>Это <strong>важно</strong></p>')).toBe('Это **важно**')
  })

  it('converts an unordered list to dashed lines', () => {
    expect(htmlToMarkdown('<ul><li>Один</li><li>Два</li></ul>')).toBe('- Один\n- Два')
  })

  it('keeps a link inside a list item', () => {
    expect(htmlToMarkdown('<ul><li><a href="https://example.com">Ссылка</a></li></ul>'))
      .toBe('- [Ссылка](https://example.com)')
  })

  it('decodes HTML entities in text', () => {
    expect(htmlToMarkdown('<p>Кавычки &amp; амперсанд</p>')).toBe('Кавычки & амперсанд')
  })

  it('escapes markdown characters that appear literally in the text', () => {
    expect(htmlToMarkdown('<p>Скидка 50*70</p>')).toBe('Скидка 50\\*70')
  })

  it('throws on a tag the converter does not know', () => {
    expect(() => htmlToMarkdown('<p><table><tr><td>x</td></tr></table></p>'))
      .toThrow(/table/)
  })
})
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Выполнить: `npx jest lib/timeline/import/html-to-markdown`
Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 3: Написать конвертер**

Создать `lib/timeline/import/html-to-markdown.ts`. Разбор — через `cheerio`
(уже в зависимостях проекта), новых пакетов не добавлять.

Поддерживаемый набор тегов — ровно тот, что встречается в данных источника:
`p`, `a`, `strong`, `ul`, `li`. Неизвестный тег обязан бросать ошибку с его
именем в сообщении: молча потерянный кусок текста при разовом переносе
обнаружится нескоро, а падение при первом же прогоне видно сразу.

Тип узла описывается локально: `domhandler` — транзитивная зависимость cheerio,
её нет в `package.json`, и импортировать типы оттуда нельзя. Сам cheerio типов
узлов наружу не отдаёт (проверено).

```ts
import * as cheerio from 'cheerio'

/** Минимальная форма узла разбора, достаточная для обхода. */
type HtmlNode = {
  type: string
  name?: string
  data?: string
  children?: HtmlNode[]
}

const SUPPORTED_TAGS = new Set(['p', 'a', 'strong', 'ul', 'li', 'br'])

/** Экранирует символы, которые markdown иначе примет за разметку. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1')
}

function renderInline($: cheerio.CheerioAPI, nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeMarkdown(node.data)
      if (node.type !== 'tag') return ''

      const tag = node.name.toLowerCase()
      if (!SUPPORTED_TAGS.has(tag)) {
        throw new Error(`htmlToMarkdown: неподдерживаемый тег <${tag}>`)
      }

      const inner = renderInline($, node.children as HtmlNode[])
      if (tag === 'strong') return `**${inner}**`
      if (tag === 'br') return '\n'
      if (tag === 'a') {
        const href = $(node).attr('href') ?? ''
        return `[${inner}](${href})`
      }
      return inner
    })
    .join('')
}

/**
 * Переводит HTML редактора Tiptap в markdown. Рассчитан на набор тегов,
 * встречающийся в переносимых данных; на любом другом теге падает, чтобы
 * потеря текста не прошла незамеченной.
 */
export function htmlToMarkdown(html: string): string {
  if (html.trim() === '') return ''

  const $ = cheerio.load(html, null, false)
  const blocks: string[] = []

  $.root()
    .children()
    .each((_index, element) => {
      const tag = element.name.toLowerCase()
      if (!SUPPORTED_TAGS.has(tag)) {
        throw new Error(`htmlToMarkdown: неподдерживаемый тег <${tag}>`)
      }

      if (tag === 'ul') {
        const items = $(element)
          .children('li')
          .map((_i, li) => `- ${renderInline($, li.children as HtmlNode[]).trim()}`)
          .get()
        blocks.push(items.join('\n'))
        return
      }

      blocks.push(renderInline($, element.children as HtmlNode[]).trim())
    })

  return blocks.filter((block) => block !== '').join('\n\n')
}
```

- [ ] **Шаг 4: Запустить тест конвертера**

Выполнить: `npx jest lib/timeline/import/html-to-markdown --verbose`
Ожидается: 11 пройденных тестов.

Если тест на экранирование или на entity падает из-за особенностей cheerio —
поправить реализацию, а не ожидание: экранирование `*` и декодирование `&amp;`
обязательны, иначе описания приедут с битой разметкой.

- [ ] **Шаг 5: Описать форму выгрузки в `export-shape.ts`**

Создать `lib/timeline/import/export-shape.ts`. Схемы описывают JSON, который
выдаёт скрипт экспорта из задачи 3, — то есть строки SQLite как есть, с
булевыми как 0/1.

```ts
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
export type SqliteEventTypeRow = z.infer<typeof sqliteEventTypeRowSchema>
export type SqliteEventRow = z.infer<typeof sqliteEventRowSchema>
export type SqliteEpochRow = z.infer<typeof sqliteEpochRowSchema>
export type SqliteTimelineRow = z.infer<typeof sqliteTimelineRowSchema>
```

- [ ] **Шаг 6: Написать провальный тест маппинга**

Создать `lib/timeline/import/map-records.test.ts`:

```ts
import { mapEvent, mapEpoch, mapTimeline, mapEventType, buildImageUrlIndex } from './map-records'
import type { SqliteEventRow, SqliteEpochRow, SqliteTimelineRow } from './export-shape'

const baseEvent: SqliteEventRow = {
  id: 'e1',
  title: 'Событие',
  event_type_id: 't1',
  start_year: 1618,
  start_era: 'CE',
  start_month: null,
  start_day: null,
  end_year: null,
  end_era: null,
  end_month: null,
  end_day: null,
  ongoing: 0,
  description_html: '',
  image_id: null,
  image_caption: null,
}

describe('buildImageUrlIndex', () => {
  it('maps an external image id to its address', () => {
    const index = buildImageUrlIndex([
      { id: 'i1', source_type: 'external', source_value: 'https://example.com/a.png' },
    ])
    expect(index.get('i1')).toBe('https://example.com/a.png')
  })

  it('throws on an uploaded image because the file has nowhere to live', () => {
    expect(() => buildImageUrlIndex([
      { id: 'i2', source_type: 'upload', source_value: 'local/file.png' },
    ])).toThrow(/i2/)
  })
})

describe('mapEvent', () => {
  it('turns the SQLite integer flag into a boolean', () => {
    expect(mapEvent({ ...baseEvent, ongoing: 1 }, new Map()).ongoing).toBe(true)
    expect(mapEvent(baseEvent, new Map()).ongoing).toBe(false)
  })

  it('keeps a BCE start year with its era', () => {
    const row = { ...baseEvent, start_year: 44, start_era: 'BCE' as const }
    expect(mapEvent(row, new Map())).toMatchObject({ startYear: 44, startEra: 'BCE' })
  })

  it('carries a full end date across', () => {
    const row = { ...baseEvent, end_year: 1648, end_era: 'CE' as const, end_month: 10, end_day: 24 }
    expect(mapEvent(row, new Map())).toMatchObject({
      endYear: 1648, endEra: 'CE', endMonth: 10, endDay: 24,
    })
  })

  it('leaves every end field null for a point event', () => {
    expect(mapEvent(baseEvent, new Map())).toMatchObject({
      endYear: null, endEra: null, endMonth: null, endDay: null,
    })
  })

  it('converts the description to markdown', () => {
    const row = { ...baseEvent, description_html: '<p>Текст со <strong>значением</strong></p>' }
    expect(mapEvent(row, new Map()).description).toBe('Текст со **значением**')
  })

  it('resolves the image id to its address', () => {
    const row = { ...baseEvent, image_id: 'i1', image_caption: 'Подпись' }
    const index = new Map([['i1', 'https://example.com/a.png']])
    expect(mapEvent(row, index)).toMatchObject({
      imageUrl: 'https://example.com/a.png',
      imageCaption: 'Подпись',
    })
  })

  it('throws when the image id is missing from the index', () => {
    const row = { ...baseEvent, image_id: 'ghost' }
    expect(() => mapEvent(row, new Map())).toThrow(/ghost/)
  })
})

describe('mapEpoch', () => {
  const baseEpoch: SqliteEpochRow = {
    id: 'p1',
    title: 'Эпоха',
    start_year: 476,
    start_era: 'CE',
    start_month: null,
    start_day: null,
    end_year: 1453,
    end_era: 'CE',
    end_month: null,
    end_day: null,
    description_html: '',
    image_id: null,
    image_caption: null,
  }

  it('keeps both boundaries because an epoch always has an end', () => {
    expect(mapEpoch(baseEpoch, new Map())).toMatchObject({
      startYear: 476, startEra: 'CE', endYear: 1453, endEra: 'CE',
    })
  })
})

describe('mapTimeline', () => {
  const baseTimeline: SqliteTimelineRow = {
    id: 'l1',
    title: 'Всеобщая история',
    description: '',
    viewport_start: 139.34,
    viewport_end: 1618.57,
    filter_type_ids_json: '["t1","t2"]',
    epochs_visible: 1,
    show_all: 1,
  }

  it('parses the stored filter list into an array', () => {
    expect(mapTimeline(baseTimeline, 'vseobschaya-istoriya').filterTypeIds).toEqual(['t1', 't2'])
  })

  it('reads an empty filter list as an empty array', () => {
    const row = { ...baseTimeline, filter_type_ids_json: '[]' }
    expect(mapTimeline(row, 'x').filterTypeIds).toEqual([])
  })

  it('takes the slug from its argument and starts unpublished', () => {
    expect(mapTimeline(baseTimeline, 'vseobschaya-istoriya')).toMatchObject({
      slug: 'vseobschaya-istoriya',
      published: false,
    })
  })

  it('turns both view flags into booleans', () => {
    expect(mapTimeline(baseTimeline, 'x')).toMatchObject({
      epochsVisible: true,
      showAll: true,
    })
  })
})

describe('mapEventType', () => {
  it('carries colour and icon across unchanged', () => {
    expect(mapEventType({ id: 't1', title: 'Книга', color: '#D97706', icon: '📖' }))
      .toMatchObject({ id: 't1', title: 'Книга', color: '#D97706', icon: '📖' })
  })
})
```

- [ ] **Шаг 7: Запустить тест и убедиться, что он падает**

Выполнить: `npx jest lib/timeline/import/map-records`
Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 8: Написать маппинг**

Создать `lib/timeline/import/map-records.ts`. Типы результата берутся из схемы
Drizzle через `typeof table.$inferInsert` — так маппинг не разъедется со схемой
из задачи 1.

Ключевые решения, которые обязаны быть в реализации:

1. `ongoing`, `epochs_visible`, `show_all`, `visible` — из `0 | 1` в `boolean`.
2. `description_html` и `local_note_html` — через `htmlToMarkdown`.
3. `image_id` — разрешается через индекс адресов; отсутствие идентификатора в
   индексе бросает ошибку с этим идентификатором в тексте.
4. Изображение с `source_type = 'upload'` бросает ошибку: файл лежит на
   локальном диске и в вебе его нет. В текущих данных таких нет, но проверка
   обязана остаться — она сработает, если владелец загрузит файл до переноса.
5. `filter_type_ids_json` — `JSON.parse`, результат обязан быть массивом строк.
6. `published` для всех переносимых таймлайнов — `false`: публикация делается
   осознанно, после проверки глазами на этапе 3.
7. `slug` приходит аргументом, не вычисляется.

- [ ] **Шаг 9: Запустить тесты**

Выполнить: `npx jest lib/timeline/import --verbose`
Ожидается: 11 тестов конвертера + 14 тестов маппинга, все зелёные.

- [ ] **Шаг 10: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline/import
git commit -m "feat: конвертер HTML->markdown и маппинг записей для переноса Timeline

E2E: не нужен — пользовательского поведения не появляется.
Wiki: нужна — правка идёт в задаче 3 этого плана."
```

---

### Task 3: Скрипты переноса, прогон и документация

**Files:**
- Create: `scripts/timeline-export.cjs`
- Create: `scripts/timeline-import.ts`
- Create: `docs/features/timeline.md`
- Modify: `docs/wiki/` — файл раздела (имя выбрать по сложившемуся в папке соглашению)

**Interfaces:**
- Consumes: таблицы Drizzle из задачи 1; `sqliteExportSchema`, `mapEvent`,
  `mapEpoch`, `mapTimeline`, `mapEventType`, `buildImageUrlIndex` из задачи 2.
- Produces: наполненные данными таблицы в Neon.

- [ ] **Шаг 1: Написать скрипт экспорта**

Создать `scripts/timeline-export.cjs`. Формат CommonJS выбран намеренно:
`better-sqlite3` есть только в проекте-источнике, и подключить его получится
через `NODE_PATH`, который работает для `require`, но игнорируется модулями ESM.

```js
// Одноразовая выгрузка локальной базы таймлайнов в JSON.
// Запускать из проекта-источника, где установлен better-sqlite3:
//
//   cd /Users/ekoshkin/documents/timeline
//   nvm use
//   NODE_PATH="$PWD/node_modules" node /путь/к/book-club/scripts/timeline-export.cjs \
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
```

- [ ] **Шаг 2: Написать скрипт импорта**

Создать `scripts/timeline-import.ts`. Требования к реализации:

1. Аргумент — путь к JSON-файлу. Без аргумента — понятная ошибка и выход с кодом 1.
2. `DATABASE_URL` берётся из окружения. Не задан — ошибка и выход.
3. Разбор JSON через `sqliteExportSchema.parse` — кривая выгрузка обязана падать
   до записи в базу, а не в середине.
4. **Отказ, если данные уже есть.** Перед вставкой посчитать строки в шести
   таблицах; если хоть где-то не ноль — напечатать, где именно, и выйти с кодом 1
   без изменений. Это повторяет поведение импортера исходного проекта и защищает
   от случайного второго прогона по проду.
5. Вся вставка — в одной транзакции через `withAuditContext` с
   `{ source: 'system', actorUserId: null, reason: 'timeline sqlite import' }`.
6. Порядок вставки: типы → события → эпохи → таймлайны → связи. Иначе упрутся
   внешние ключи.
7. Slug — из явной таблицы соответствия в коде скрипта:

```ts
const SLUG_BY_TITLE: Record<string, string> = {
  'Всеобщая история': 'vseobschaya-istoriya',
  'Заря всего': 'zarya-vsego',
}
```

Заголовок, которого нет в таблице, — ошибка с этим заголовком в тексте.

8. В конце — отчёт в stdout: сколько строк вставлено в каждую из шести таблиц.

- [ ] **Шаг 3: Применить миграцию к Neon-ветке `e2e`**

В проекте две базы. `.env.local` — **продовая**, её на этом шаге не трогать.
`.env.test.local` — изолированная Neon-ветка `e2e` (с защитой `PROD_DB_HOST_MARKER`),
именно она и есть "база разработки". Применять миграцию туда:

```bash
set -a; . ./.env.test.local; set +a
```

Эта ветка всё равно требует ручного применения миграции: `drizzle-kit push`
в ночном workflow не создаёт аудит-триггеры (см. `docs/wiki/Operations-Runbook.md`).

```bash
node scripts/apply-migration.mjs drizzle/0056_timeline_tables.sql
```

Ожидается: `Applied: drizzle/0056_timeline_tables.sql`.

Если упадёт на `audit_capture()` — значит база, к которой подключились, старее
миграции `0040`. Проверить, на какую базу указывает `DATABASE_URL`.

- [ ] **Шаг 4: Выгрузить данные источника**

```bash
cd /Users/ekoshkin/documents/timeline
nvm use
NODE_PATH="$PWD/node_modules" node <путь-к-worktree>/scripts/timeline-export.cjs \
  data/timeline.sqlite > /tmp/timeline-export.json
```

Ожидается строка в stderr со счётчиками. На момент составления плана они были:
типов 3, событий 30, эпох 14, таймлайнов 2, связей 50. Расхождение — не ошибка:
владелец мог добавить записи. Зафиксировать фактические числа для отчёта.

- [ ] **Шаг 5: Импортировать в Neon-ветку `e2e`**

```bash
cd <путь-к-worktree>
npx tsx scripts/timeline-import.ts /tmp/timeline-export.json
```

Ожидается отчёт с шестью счётчиками, совпадающими с выгрузкой.

- [ ] **Шаг 6: Проверить отказ от повторного прогона**

Выполнить ту же команду ещё раз.
Ожидается: сообщение, что таблицы не пусты, выход с кодом 1, данные не тронуты.

- [ ] **Шаг 7: Сверить перенос глазами**

```bash
npx tsx -e "
import { db } from './lib/db'
import { historicalEvents, timelines } from './lib/db/schema'
const events = await db.select().from(historicalEvents).limit(3)
console.log(events.map(e => ({ title: e.title, desc: e.description.slice(0, 80) })))
console.log(await db.select().from(timelines))
"
```

Проверить: описания читаются как markdown (ссылки в форме `[текст](адрес)`, не
`<a href=...>`), у таймлайнов проставлены slug, `published` везде `false`.

- [ ] **Шаг 8: Написать `docs/features/timeline.md`**

Описать: назначение раздела, шесть таблиц и связи между ними, отличия от
локального приложения (нет таблицы изображений, markdown вместо HTML, есть slug
и признак публикации), команды переноса, статус этапов по спецификации.

- [ ] **Шаг 9: Обновить `docs/wiki/`**

Обязательно по правилам проекта: этап меняет схему БД и связи данных. Изложить
для владельца, без кода: что за раздел, откуда взялись данные, где
редактируется (пока нигде — админка на этапе 4), что публичных страниц ещё нет,
почему таймлайны лежат неопубликованными.

Файл выбрать по сложившемуся в `docs/wiki/` соглашению об именах; если раздела
про таймлайны там нет — завести новый и добавить ссылку в оглавление, если оно
есть.

- [ ] **Шаг 10: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add scripts/timeline-export.cjs scripts/timeline-import.ts docs/features/timeline.md docs/wiki
git commit -m "feat: скрипты переноса данных Timeline из SQLite и документация

E2E: не нужен — пользовательского поведения не появляется.
Wiki: обновлена — этап меняет схему БД и связи данных."
```

- [ ] **Шаг 11: Пул-реквест**

```bash
git push -u origin feat/timeline-schema
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

`BLOCKED` — ждёт CI, норма. `BEHIND` — `gh pr update-branch`. `CONFLICTING` —
перебазироваться на свежий `origin/main`.

- [ ] **Шаг 12: Применить миграцию и импорт к продовой базе**

Выполняется **после** мержа PR, вручную, с `DATABASE_URL` продовой базы.
Отдельным шагом, потому что автодеплой Vercel миграции не применяет.

```bash
node scripts/apply-migration.mjs drizzle/0056_timeline_tables.sql
npx tsx scripts/timeline-import.ts /tmp/timeline-export.json
```

Пользователи изменений не увидят: страниц раздела ещё нет, а таймлайны лежат
неопубликованными.

---

## Self-Review

**Покрытие спецификации.** Задача 1 закрывает пункт «миграция Drizzle с шестью
таблицами, регистрация в `AUDITED_TABLES`, аудит-триггеры». Задачи 2 и 3
закрывают «скрипт читает `data/timeline.sqlite`, конвертирует даты и описания,
переносит адреса картинок, печатает отчёт». Требование «интерфейса ещё нет»
соблюдено: ни страниц, ни маршрутов не создаётся.

**Отклонение от спецификации.** Спецификация предполагала один скрипт
`scripts/import-timeline-sqlite.ts`. Разделено на два: `better-sqlite3` не
входит в зависимости этого проекта, а добавлять нативный модуль ради разового
переноса в приложение на Vercel — лишний риск сборки. Выгрузка запускается там,
где библиотека уже есть.

**Заглушки.** Проверено: «TBD» и «добавить обработку ошибок» отсутствуют.
Задача 3, шаг 2 задаёт скрипт импорта списком из восьми обязательных требований,
а не готовым кодом — сознательно: это последовательный скрипт из вызовов уже
описанных функций, и переписывать его целиком в план значит дублировать
реализацию. Все нетривиальные решения (отказ при непустых таблицах, порядок
вставки, таблица slug, параметры аудита) заданы явно.

**Согласованность типов.** `SqliteExport` и типы строк определены в задаче 2 и
используются в задаче 3. Функции `mapEvent`, `mapEpoch`, `mapTimeline`,
`mapEventType`, `buildImageUrlIndex` объявлены в блоке Interfaces задачи 2 с теми
же именами, что в тестах и в задаче 3. Имена таблиц Drizzle из задачи 1
(`historicalEventTypes`, `historicalEvents`, `historicalEpochs`, `timelines`,
`timelineEvents`, `timelineEpochs`) совпадают с именами в SQL-миграции и в
`AUDITED_TABLES`.

**Ожидаемый счёт тестов:** 6 наборов проверок в тесте миграции (два из них
параметризованы по шести таблицам), 11 тестов конвертера, 14 тестов маппинга.

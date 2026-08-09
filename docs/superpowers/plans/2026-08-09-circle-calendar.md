# Календарь круга — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-СКИЛЛ — `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** участники круга согласуют время встречи внутри сайта — закрашивают своё свободное время в получасовой сетке, видят наложение, фиксируют слот.

**Архитектура:** свободное время глобальное у пользователя (одно на все круги), страница согласования — на круг, адресуется парой «книга + номер круга» вместо идентификатора строки `matching_circles` (круги пересобираются при новых записях). Расчёт наложения и кандидатов вынесен в чистые модули без обращения к базе; клиент считает то же самое для отрисовки, сервер перепроверяет при назначении.

**Стек:** Next.js 14 App Router, Drizzle ORM + Neon Postgres, NextAuth v5, Jest, Playwright.

**Спека:** `docs/superpowers/specs/2026-08-09-circle-calendar-design.md`
**Прототип:** `docs/design/circle-calendar/Календарь круга.html` — источник правды по разметке и микровзаимодействиям.

## Глобальные ограничения

- Ветка на задачу — отдельный `git worktree` от свежего `origin/main`; прямой push в `main` заблокирован, всё через PR с автомержем.
- `--no-verify` запрещён. Перед каждым коммитом `npm run lint && npm run typecheck && npm test`.
- Мутации только через `withAuditContext` (`lib/audit/with-audit-context.ts`) — иначе падает ESLint-правило `no-restricted-syntax`.
- Новая мутабельная таблица → имя в `AUDITED_TABLES` (`lib/audit/audited-tables.ts`) **и** триггер в миграции. Иначе падает `drizzle/0040_audit_triggers.test.ts`.
- Цвета только токенами из `app/globals.css`. Прозрачность — `color-mix(in srgb, var(--success) N%, transparent)`. Литеральный `rgba(45,106,79,…)` из прототипа в продукт не переносится.
- Радиусы `--radius-card` / `--radius-control`, тени `--shadow-card` / `--shadow-pop`. Литеральные `rounded-*` запрещены.
- Роуты, читающие данные, помечаются `export const dynamic = 'force-dynamic'`.
- Шаг слота — 30 минут, окно — 28 дней, длительность встречи по умолчанию 60 минут. Значения берутся из констант, не из литералов.
- Часовые пояса: в базе абсолютные `timestamptz`, конвертация только на отображении.
- Перед правкой Playwright-тестов обязательно читается `docs/features/testing.md`.
- Клавиатурная доступность сетки в этот план **не входит** — [issue #537](https://github.com/bon2362/book-club/issues/537).

**О полноте тестового кода в плане.** Для чистых модулей (задачи 2–6) тела тестов написаны целиком — их можно копировать как есть. Для роутов и React-компонентов (задачи 8–14) заданы точные имена тестов и проверяемые утверждения, но не тела: обвязка моков в проекте своя, и списывать её нужно с конкретного соседнего файла, а не с выдуманного образца. Перед написанием route-теста прочитать `app/api/matching/state/route.test.ts`, перед компонентным — `components/nd/MatchingBookCard.test.tsx`, перед механикой мобильного листа — `components/nd/MatchingBookDetailModal.tsx`. Набор имён тестов менять нельзя: это контракт задачи.

## Структура файлов

**Данные**
- `lib/db/schema.ts` — правка: `users.timezone`, `users.timezoneConfirmed`, три новые таблицы
- `drizzle/0062_calendar.sql` — миграция
- `drizzle/0062_calendar.test.ts` — контракт миграции
- `lib/audit/audited-tables.ts` — правка: три имени

**Чистая логика** (без импортов базы, тестируется в изоляции)
- `lib/calendar/slots.ts` — константы и арифметика получасовок
- `lib/calendar/availability-intervals.ts` — операции над интервалами
- `lib/calendar/busy.ts` — вычитание занятого встречами
- `lib/calendar/overlap.ts` — наложение и правило кандидата
- `lib/calendar/slug.ts` — транслитерация и уникальность адреса

**Доступ к данным**
- `lib/calendar/schedule-db.ts` — резолв слага, ленивое создание пространства, состав круга
- `lib/calendar/public-state.ts` — сборка ответа `GET`

**HTTP**
- `app/api/calendar/[slug]/route.ts` — `GET`, `PATCH`
- `app/api/calendar/[slug]/meetings/route.ts` — `POST`
- `app/api/calendar/[slug]/meetings/[id]/route.ts` — `DELETE`
- `app/api/calendar/availability/route.ts` — `PUT`
- `app/api/profile/timezone/route.ts` — `PATCH`

**Интерфейс**
- `app/calendar/[slug]/page.tsx` — серверная страница
- `components/nd/CalendarClient.tsx` — состояние, загрузка, сохранение
- `components/nd/CalendarGrid.tsx` — сетка и закрашивание
- `components/nd/CalendarCellPopover.tsx` — попап клетки
- `components/nd/CalendarMeetingCard.tsx` — карточка встречи и диалог отмены
- `components/nd/CalendarParticipants.tsx` — состав круга и фильтр
- `components/nd/CalendarLegend.tsx` — легенда
- `components/nd/CalendarTimezoneBar.tsx` — полоса часового пояса
- `components/nd/MatchingBookCircles.tsx` — правка: ссылка «Согласовать время»
- `app/globals.css` — правка: только если понадобится токен высоты клетки

**Тесты и документация**
- `e2e/calendar.spec.ts`, `e2e/calendar-layout.spec.ts`
- `docs/features/calendar.md`, правки в `docs/wiki/`

---

## Задача 1: Схема, миграция и аудит

**Файлы:**
- Правка: `lib/db/schema.ts`
- Правка: `lib/audit/audited-tables.ts`
- Создать: `drizzle/0062_calendar.sql`
- Создать: `drizzle/0062_calendar.test.ts`

**Интерфейсы:**
- Отдаёт дальше: таблицы `userAvailability`, `circleSchedules`, `circleMeetings` и колонки `users.timezone`, `users.timezoneConfirmed` из `lib/db/schema.ts`.

- [ ] **Шаг 1: Написать падающий контрактный тест миграции**

Создать `drizzle/0062_calendar.test.ts`. Тест читает SQL как текст и проверяет наличие ключевых конструкций — так же, как это делают `drizzle/0061_matching_multibook.test.ts` и `drizzle/0040_audit_triggers.test.ts`. Сначала прочитать один из них, чтобы повторить принятый стиль.

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDITED_TABLES } from '@/lib/audit/audited-tables'

const sqlText = readFileSync(join(process.cwd(), 'drizzle/0062_calendar.sql'), 'utf8')

describe('0062_calendar', () => {
  it('добавляет часовой пояс и флаг подтверждения', () => {
    expect(sqlText).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text')
    expect(sqlText).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone_confirmed" boolean NOT NULL DEFAULT false')
  })

  it('создаёт три таблицы календаря', () => {
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "user_availability"')
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "circle_schedules"')
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "circle_meetings"')
  })

  it('вешает audit_capture на каждую новую таблицу', () => {
    for (const table of ['user_availability', 'circle_schedules', 'circle_meetings']) {
      expect(AUDITED_TABLES).toContain(table)
      expect(sqlText).toContain(`CREATE TRIGGER audit_${table} AFTER INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture();`)
    }
  })

  it('запрещает интервалы вне получасовой сетки и нулевой длины', () => {
    expect(sqlText).toContain('user_availability_aligned_check')
    expect(sqlText).toContain('user_availability_order_check')
  })

  it('делает адрес страницы уникальным', () => {
    expect(sqlText).toContain('circle_schedules_slug_uniq')
    expect(sqlText).toContain('circle_schedules_session_book_position_uniq')
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest drizzle/0062_calendar.test.ts
```

Ожидается: FAIL — файла миграции нет, `readFileSync` бросает `ENOENT`.

- [ ] **Шаг 3: Написать миграцию**

Создать `drizzle/0062_calendar.sql`. Разделитель между стейтментами — `--> statement-breakpoint`, как в остальных миграциях проекта.

```sql
-- Календарь круга: глобальное свободное время пользователя, пространства согласования и встречи.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone_confirmed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_availability" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_availability_order_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "user_availability_aligned_check" CHECK (
    date_part('minute', "starts_at") IN (0, 30)
    AND date_part('second', "starts_at") = 0
    AND date_part('minute', "ends_at") IN (0, 30)
    AND date_part('second', "ends_at") = 0
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_availability_user_start_idx" ON "user_availability" ("user_id", "starts_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_schedules" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "matching_sessions"("id") ON DELETE CASCADE,
  "book_id" text NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  "slug" text NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 60,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "circle_schedules_position_check" CHECK ("position" >= 1),
  CONSTRAINT "circle_schedules_duration_check" CHECK ("duration_minutes" >= 30 AND "duration_minutes" % 30 = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_schedules_slug_uniq" ON "circle_schedules" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_schedules_session_book_position_uniq" ON "circle_schedules" ("session_id", "book_id", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_meetings" (
  "id" text PRIMARY KEY NOT NULL,
  "schedule_id" text NOT NULL REFERENCES "circle_schedules"("id") ON DELETE CASCADE,
  "starts_at" timestamp with time zone NOT NULL,
  "duration_minutes" integer NOT NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "canceled_at" timestamp with time zone,
  "canceled_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "circle_meetings_duration_check" CHECK ("duration_minutes" >= 30 AND "duration_minutes" % 30 = 0),
  CONSTRAINT "circle_meetings_aligned_check" CHECK (
    date_part('minute', "starts_at") IN (0, 30) AND date_part('second', "starts_at") = 0
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_meetings_schedule_start_idx" ON "circle_meetings" ("schedule_id", "starts_at");
--> statement-breakpoint
CREATE TRIGGER audit_user_availability AFTER INSERT OR UPDATE OR DELETE ON "user_availability" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_circle_schedules AFTER INSERT OR UPDATE OR DELETE ON "circle_schedules" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_circle_meetings AFTER INSERT OR UPDATE OR DELETE ON "circle_meetings" FOR EACH ROW EXECUTE FUNCTION audit_capture();
```

- [ ] **Шаг 4: Добавить таблицы в реестр аудита**

В `lib/audit/audited-tables.ts` дописать в массив `AUDITED_TABLES` три строки после `'timeline_epochs'`:

```ts
  'user_availability',
  'circle_schedules',
  'circle_meetings',
```

- [ ] **Шаг 5: Описать таблицы в схеме Drizzle**

В `lib/db/schema.ts` в определение `users` добавить две колонки рядом с `isAdmin`:

```ts
  timezone: text('timezone'),
  timezoneConfirmed: boolean('timezone_confirmed').notNull().default(false),
```

В конец файла добавить три таблицы:

```ts
export const userAvailability = pgTable('user_availability', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { mode: 'date', withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userStartIdx: index('user_availability_user_start_idx').on(t.userId, t.startsAt),
  orderCheck: check('user_availability_order_check', sql`${t.endsAt} > ${t.startsAt}`),
}))

export const circleSchedules = pgTable('circle_schedules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => matchingSessions.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(),
  slug: text('slug').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: uniqueIndex('circle_schedules_slug_uniq').on(t.slug),
  identityUniq: uniqueIndex('circle_schedules_session_book_position_uniq').on(t.sessionId, t.bookId, t.position),
  positionCheck: check('circle_schedules_position_check', sql`${t.position} >= 1`),
}))

export const circleMeetings = pgTable('circle_meetings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  scheduleId: text('schedule_id').notNull().references(() => circleSchedules.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  canceledAt: timestamp('canceled_at', { mode: 'date', withTimezone: true }),
  canceledBy: text('canceled_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  scheduleStartIdx: index('circle_meetings_schedule_start_idx').on(t.scheduleId, t.startsAt),
}))
```

Проверить, что `boolean`, `index`, `check`, `uniqueIndex`, `sql` уже импортированы в шапке файла; если нет — дописать в существующие импорты.

- [ ] **Шаг 6: Прогнать тесты**

```bash
npx jest drizzle/0062_calendar.test.ts drizzle/0040_audit_triggers.test.ts
```

Ожидается: PASS оба. Второй проверяет синхронность реестра и триггеров — если падает, значит имя таблицы в `AUDITED_TABLES` и в `CREATE TRIGGER` разошлось.

- [ ] **Шаг 7: Полный гейт и коммит**

```bash
npm run lint && npm run typecheck && npm test
```

```bash
git add lib/db/schema.ts lib/audit/audited-tables.ts drizzle/0062_calendar.sql drizzle/0062_calendar.test.ts
git commit -m "feat: схема и миграция календаря круга"
```

---

## Задача 2: Арифметика получасовок

**Файлы:**
- Создать: `lib/calendar/slots.ts`
- Создать: `lib/calendar/__tests__/slots.test.ts`

**Интерфейсы:**
- Отдаёт дальше: `SLOT_MINUTES`, `WINDOW_DAYS`, `DEFAULT_MEETING_MINUTES`, `MIN_MARKED_PARTICIPANTS`, тип `Interval`, функции `isSlotAligned`, `floorToSlot`, `addSlots`, `slotKey`, `windowBounds`, `enumerateSlots`.

Окно считается от текущего момента, а не от начала суток: «сегодня» у людей в разных поясах разное, а абсолютная граница одна. Колонки-дни клиент нарезает сам, в поясе смотрящего.

- [ ] **Шаг 1: Написать падающий тест**

```ts
import {
  SLOT_MINUTES, WINDOW_DAYS, isSlotAligned, floorToSlot, addSlots,
  slotKey, windowBounds, enumerateSlots,
} from '@/lib/calendar/slots'

const at = (iso: string) => new Date(iso)

describe('slots', () => {
  it('считает выровненными только :00 и :30 без секунд', () => {
    expect(isSlotAligned(at('2026-08-09T17:00:00.000Z'))).toBe(true)
    expect(isSlotAligned(at('2026-08-09T17:30:00.000Z'))).toBe(true)
    expect(isSlotAligned(at('2026-08-09T17:15:00.000Z'))).toBe(false)
    expect(isSlotAligned(at('2026-08-09T17:00:01.000Z'))).toBe(false)
  })

  it('округляет вниз до получаса', () => {
    expect(floorToSlot(at('2026-08-09T17:29:59.999Z')).toISOString()).toBe('2026-08-09T17:00:00.000Z')
    expect(floorToSlot(at('2026-08-09T17:30:00.000Z')).toISOString()).toBe('2026-08-09T17:30:00.000Z')
  })

  it('сдвигает на N получасовок, в том числе назад', () => {
    expect(addSlots(at('2026-08-09T17:00:00.000Z'), 3).toISOString()).toBe('2026-08-09T18:30:00.000Z')
    expect(addSlots(at('2026-08-09T17:00:00.000Z'), -2).toISOString()).toBe('2026-08-09T16:00:00.000Z')
  })

  it('строит окно от округлённого сейчас на WINDOW_DAYS вперёд', () => {
    const { start, end } = windowBounds(at('2026-08-09T12:17:00.000Z'))
    expect(start.toISOString()).toBe('2026-08-09T12:00:00.000Z')
    expect(end.getTime() - start.getTime()).toBe(WINDOW_DAYS * 24 * 60 * 60 * 1000)
  })

  it('перечисляет получасовки интервала, не включая правую границу', () => {
    const keys = enumerateSlots({ startsAt: at('2026-08-09T17:00:00.000Z'), endsAt: at('2026-08-09T18:30:00.000Z') })
    expect(keys).toEqual([
      '2026-08-09T17:00:00.000Z',
      '2026-08-09T17:30:00.000Z',
      '2026-08-09T18:00:00.000Z',
    ])
  })

  it('slotKey совпадает с ISO-представлением', () => {
    expect(slotKey(at('2026-08-09T17:00:00.000Z'))).toBe('2026-08-09T17:00:00.000Z')
  })

  it('шаг слота — 30 минут', () => {
    expect(SLOT_MINUTES).toBe(30)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/slots.test.ts
```

Ожидается: FAIL — `Cannot find module '@/lib/calendar/slots'`.

- [ ] **Шаг 3: Реализовать модуль**

```ts
export const SLOT_MINUTES = 30
export const WINDOW_DAYS = 28
export const DEFAULT_MEETING_MINUTES = 60
/** Пока отметился только один человек, кандидатов нет: иначе он назначит встречу сам себе. */
export const MIN_MARKED_PARTICIPANTS = 2

const SLOT_MS = SLOT_MINUTES * 60 * 1000

export interface Interval {
  startsAt: Date
  endsAt: Date
}

export interface Window {
  start: Date
  end: Date
}

export function isSlotAligned(value: Date): boolean {
  return value.getTime() % SLOT_MS === 0
}

export function floorToSlot(value: Date): Date {
  return new Date(Math.floor(value.getTime() / SLOT_MS) * SLOT_MS)
}

export function addSlots(value: Date, count: number): Date {
  return new Date(value.getTime() + count * SLOT_MS)
}

export function slotKey(value: Date): string {
  return value.toISOString()
}

export function windowBounds(now: Date): Window {
  const start = floorToSlot(now)
  return { start, end: new Date(start.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000) }
}

export function enumerateSlots(interval: Interval): string[] {
  const keys: string[] = []
  for (let t = interval.startsAt.getTime(); t < interval.endsAt.getTime(); t += SLOT_MS) {
    keys.push(new Date(t).toISOString())
  }
  return keys
}
```

- [ ] **Шаг 4: Прогнать тест**

```bash
npx jest lib/calendar/__tests__/slots.test.ts
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/slots.ts lib/calendar/__tests__/slots.test.ts
git commit -m "feat: арифметика получасовых слотов календаря"
```

---

## Задача 3: Операции над интервалами доступности

**Файлы:**
- Создать: `lib/calendar/availability-intervals.ts`
- Создать: `lib/calendar/__tests__/availability-intervals.test.ts`

**Интерфейсы:**
- Использует: `Interval`, `Window` из `lib/calendar/slots.ts`.
- Отдаёт дальше: `normalize`, `addInterval`, `removeInterval`, `clampToWindow`, `hasAnyIn`.

Это то место, ради которого выбрано хранение интервалами вместо строки на клетку: один мазок мышью — одна строка в базе и одна запись в журнале аудита.

- [ ] **Шаг 1: Написать падающий тест**

```ts
import { normalize, addInterval, removeInterval, clampToWindow, hasAnyIn } from '@/lib/calendar/availability-intervals'
import type { Interval } from '@/lib/calendar/slots'

const iv = (from: string, to: string): Interval => ({ startsAt: new Date(from), endsAt: new Date(to) })
const show = (list: Interval[]) => list.map((i) => `${i.startsAt.toISOString()}/${i.endsAt.toISOString()}`)

const D = '2026-08-09T'

describe('availability-intervals', () => {
  it('сортирует и склеивает пересекающиеся', () => {
    const result = normalize([iv(`${D}18:00:00.000Z`, `${D}19:00:00.000Z`), iv(`${D}17:00:00.000Z`, `${D}18:30:00.000Z`)])
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('склеивает соседние встык', () => {
    const result = normalize([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`), iv(`${D}18:00:00.000Z`, `${D}19:00:00.000Z`)])
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('не склеивает разнесённые', () => {
    const result = normalize([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`), iv(`${D}19:00:00.000Z`, `${D}20:00:00.000Z`)])
    expect(result).toHaveLength(2)
  })

  it('добавляет отрезок, поглощая соседей', () => {
    const result = addInterval([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`)], iv(`${D}17:30:00.000Z`, `${D}19:00:00.000Z`))
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('разрезает интервал посередине', () => {
    const result = removeInterval([iv(`${D}17:00:00.000Z`, `${D}20:00:00.000Z`)], iv(`${D}18:00:00.000Z`, `${D}18:30:00.000Z`))
    expect(show(result)).toEqual([
      `${D}17:00:00.000Z/${D}18:00:00.000Z`,
      `${D}18:30:00.000Z/${D}20:00:00.000Z`,
    ])
  })

  it('срезает край, не оставляя пустышек', () => {
    const result = removeInterval([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`)], iv(`${D}16:00:00.000Z`, `${D}18:00:00.000Z`))
    expect(result).toEqual([])
  })

  it('обрезает по окну и выбрасывает то, что целиком снаружи', () => {
    const window = { start: new Date(`${D}12:00:00.000Z`), end: new Date(`${D}20:00:00.000Z`) }
    const result = clampToWindow([
      iv(`${D}10:00:00.000Z`, `${D}13:00:00.000Z`),
      iv(`${D}08:00:00.000Z`, `${D}09:00:00.000Z`),
      iv(`${D}19:00:00.000Z`, `${D}23:00:00.000Z`),
    ], window)
    expect(show(result)).toEqual([
      `${D}12:00:00.000Z/${D}13:00:00.000Z`,
      `${D}19:00:00.000Z/${D}20:00:00.000Z`,
    ])
  })

  it('сообщает, есть ли хоть что-то в окне', () => {
    const window = { start: new Date(`${D}12:00:00.000Z`), end: new Date(`${D}20:00:00.000Z`) }
    expect(hasAnyIn([iv(`${D}08:00:00.000Z`, `${D}09:00:00.000Z`)], window)).toBe(false)
    expect(hasAnyIn([iv(`${D}13:00:00.000Z`, `${D}14:00:00.000Z`)], window)).toBe(true)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/availability-intervals.test.ts
```

Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать модуль**

```ts
import type { Interval, Window } from '@/lib/calendar/slots'

/** Непересекающиеся интервалы по возрастанию начала, соседние встык склеены. */
export function normalize(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.endsAt.getTime() > i.startsAt.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  const merged: Interval[] = []
  for (const current of sorted) {
    const last = merged[merged.length - 1]
    if (last && current.startsAt.getTime() <= last.endsAt.getTime()) {
      if (current.endsAt.getTime() > last.endsAt.getTime()) last.endsAt = new Date(current.endsAt)
      continue
    }
    merged.push({ startsAt: new Date(current.startsAt), endsAt: new Date(current.endsAt) })
  }
  return merged
}

export function addInterval(intervals: Interval[], add: Interval): Interval[] {
  return normalize([...intervals, add])
}

export function removeInterval(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = []
  for (const current of normalize(intervals)) {
    const overlaps = current.startsAt < cut.endsAt && cut.startsAt < current.endsAt
    if (!overlaps) {
      out.push(current)
      continue
    }
    if (current.startsAt < cut.startsAt) {
      out.push({ startsAt: new Date(current.startsAt), endsAt: new Date(cut.startsAt) })
    }
    if (cut.endsAt < current.endsAt) {
      out.push({ startsAt: new Date(cut.endsAt), endsAt: new Date(current.endsAt) })
    }
  }
  return out
}

export function clampToWindow(intervals: Interval[], window: Window): Interval[] {
  const out: Interval[] = []
  for (const current of normalize(intervals)) {
    const startsAt = current.startsAt < window.start ? window.start : current.startsAt
    const endsAt = current.endsAt > window.end ? window.end : current.endsAt
    if (endsAt.getTime() > startsAt.getTime()) {
      out.push({ startsAt: new Date(startsAt), endsAt: new Date(endsAt) })
    }
  }
  return out
}

export function hasAnyIn(intervals: Interval[], window: Window): boolean {
  return clampToWindow(intervals, window).length > 0
}
```

- [ ] **Шаг 4: Прогнать тест**

```bash
npx jest lib/calendar/__tests__/availability-intervals.test.ts
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/availability-intervals.ts lib/calendar/__tests__/availability-intervals.test.ts
git commit -m "feat: операции над интервалами доступности"
```

---

## Задача 4: Вычитание занятого встречами

**Файлы:**
- Создать: `lib/calendar/busy.ts`
- Создать: `lib/calendar/__tests__/busy.test.ts`

**Интерфейсы:**
- Использует: `Interval` из `lib/calendar/slots.ts`, `removeInterval` из `lib/calendar/availability-intervals.ts`.
- Отдаёт дальше: типы `MeetingRef`, `BusyBlock`; функции `toBusyBlocks`, `subtractBusy`, `busyAt`.

Занятым считается время всех неотменённых встреч человека **во всех** его кругах, включая текущий: если круг уже встречается в субботу в пять, вторую встречу на то же время назначить нельзя.

- [ ] **Шаг 1: Написать падающий тест**

```ts
import { toBusyBlocks, subtractBusy, busyAt } from '@/lib/calendar/busy'
import type { Interval } from '@/lib/calendar/slots'

const D = '2026-08-09T'
const iv = (from: string, to: string): Interval => ({ startsAt: new Date(`${D}${from}`), endsAt: new Date(`${D}${to}`) })
const show = (list: Interval[]) => list.map((i) => `${i.startsAt.toISOString().slice(11, 16)}-${i.endsAt.toISOString().slice(11, 16)}`)

describe('busy', () => {
  it('разворачивает встречу в блок нужной длины и пропускает отменённые', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}17:00:00.000Z`), durationMinutes: 90, bookTitle: 'Дом листьев', canceledAt: null },
      { id: 'm2', startsAt: new Date(`${D}19:00:00.000Z`), durationMinutes: 60, bookTitle: 'Игра в бисер', canceledAt: new Date() },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].endsAt.toISOString()).toBe(`${D}18:30:00.000Z`)
    expect(blocks[0].bookTitle).toBe('Дом листьев')
  })

  it('вырезает занятое из свободного', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}18:00:00.000Z`), durationMinutes: 60, bookTitle: 'Дом листьев', canceledAt: null },
    ])
    expect(show(subtractBusy([iv('17:00:00.000Z', '20:00:00.000Z')], blocks))).toEqual(['17:00-18:00', '19:00-20:00'])
  })

  it('находит блок по началу получасовки и называет книгу', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}18:00:00.000Z`), durationMinutes: 60, bookTitle: 'Дом листьев', canceledAt: null },
    ])
    expect(busyAt(blocks, new Date(`${D}18:30:00.000Z`))?.bookTitle).toBe('Дом листьев')
    expect(busyAt(blocks, new Date(`${D}19:00:00.000Z`))).toBeNull()
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/busy.test.ts
```

Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать модуль**

```ts
import type { Interval } from '@/lib/calendar/slots'
import { removeInterval } from '@/lib/calendar/availability-intervals'

export interface MeetingRef {
  id: string
  startsAt: Date
  durationMinutes: number
  bookTitle: string
  canceledAt: Date | null
}

export interface BusyBlock {
  meetingId: string
  startsAt: Date
  endsAt: Date
  bookTitle: string
}

export function toBusyBlocks(meetings: MeetingRef[]): BusyBlock[] {
  return meetings
    .filter((meeting) => meeting.canceledAt === null)
    .map((meeting) => ({
      meetingId: meeting.id,
      startsAt: new Date(meeting.startsAt),
      endsAt: new Date(meeting.startsAt.getTime() + meeting.durationMinutes * 60 * 1000),
      bookTitle: meeting.bookTitle,
    }))
}

export function subtractBusy(intervals: Interval[], blocks: BusyBlock[]): Interval[] {
  return blocks.reduce<Interval[]>(
    (acc, block) => removeInterval(acc, { startsAt: block.startsAt, endsAt: block.endsAt }),
    intervals,
  )
}

export function busyAt(blocks: BusyBlock[], slotStart: Date): BusyBlock | null {
  const at = slotStart.getTime()
  return blocks.find((block) => block.startsAt.getTime() <= at && at < block.endsAt.getTime()) ?? null
}
```

- [ ] **Шаг 4: Прогнать тест**

```bash
npx jest lib/calendar/__tests__/busy.test.ts
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/busy.ts lib/calendar/__tests__/busy.test.ts
git commit -m "feat: вычитание занятого встречами времени"
```

---

## Задача 5: Наложение и правило кандидата

**Файлы:**
- Создать: `lib/calendar/overlap.ts`
- Создать: `lib/calendar/__tests__/overlap.test.ts`

**Интерфейсы:**
- Использует: `Interval`, `Window`, `slotKey`, `addSlots`, `enumerateSlots`, `SLOT_MINUTES`, `MIN_MARKED_PARTICIPANTS` из `lib/calendar/slots.ts`; `BusyBlock`, `busyAt` из `lib/calendar/busy.ts`; `hasAnyIn` из `lib/calendar/availability-intervals.ts`.
- Отдаёт дальше: типы `ParticipantAvailability`, `OverlapCell`, `OverlapResult`; функция `computeOverlap`.

Правило кандидата целиком: отметившихся не меньше `MIN_MARKED_PARTICIPANTS`; все отметившиеся свободны всю длительность подряд; ни одна клетка не занята встречей этого круга; встреча помещается в окно и не начинается в прошлом. Незаполнившие участники в знаменатель не входят и назначению не мешают.

- [ ] **Шаг 1: Написать падающий тест**

```ts
import { computeOverlap } from '@/lib/calendar/overlap'
import type { ParticipantAvailability } from '@/lib/calendar/overlap'

const D = '2026-08-09T'
const t = (hhmm: string) => new Date(`${D}${hhmm}:00.000Z`)
const win = { start: t('12:00'), end: new Date(`2026-09-06T12:00:00.000Z`) }

const person = (ref: string, from: string, to: string): ParticipantAvailability =>
  ({ ref, intervals: [{ startsAt: t(from), endsAt: t(to) }], busy: [] })

describe('computeOverlap', () => {
  it('считает свободных, занятых и не отметившихся по клетке', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '18:00', '20:00'), { ref: 'c', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    const cell = result.cells.get(t('18:00').toISOString())!
    expect(cell.freeRefs).toEqual(['a', 'b'])
    expect(cell.idleRefs).toEqual(['c'])
    expect(result.markedRefs).toEqual(['a', 'b'])
  })

  it('кандидат там, где все отметившиеся свободны всю длительность', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '18:00', '20:00')],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(true)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('17:00').toISOString())).toBe(false)
  })

  it('не отметившийся участник не блокирует назначение', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '17:00', '19:00'), { ref: 'c', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('17:00').toISOString())).toBe(true)
  })

  it('один отметившийся не даёт кандидатов', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), { ref: 'b', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.size).toBe(0)
  })

  it('занятость участника в другом круге снимает кандидата', () => {
    const busyBlock = { meetingId: 'm', startsAt: t('18:00'), endsAt: t('18:30'), bookTitle: 'Дом листьев' }
    const result = computeOverlap({
      participants: [
        person('a', '17:00', '20:00'),
        { ...person('b', '17:00', '20:00'), busy: [busyBlock] },
      ],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('17:30').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(true)
    expect(result.cells.get(t('18:00').toISOString())!.busyRefs).toEqual(['b'])
  })

  it('встреча самого круга закрывает свои клетки', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '20:00'), person('b', '17:00', '20:00')],
      window: win, now: t('12:00'), durationMinutes: 60,
      circleBusy: [{ meetingId: 'own', startsAt: t('18:00'), endsAt: t('19:00'), bookTitle: 'Заря всего' }],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('19:00').toISOString())).toBe(true)
  })

  it('прошедшее время кандидатом не бывает', () => {
    const result = computeOverlap({
      participants: [person('a', '12:00', '20:00'), person('b', '12:00', '20:00')],
      window: win, now: t('15:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('13:00').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('15:00').toISOString())).toBe(true)
  })

  it('встреча, не помещающаяся в окно, кандидатом не бывает', () => {
    const shortWindow = { start: t('12:00'), end: t('19:00') }
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '17:00', '19:00')],
      window: shortWindow, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(true)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(false)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/overlap.test.ts
```

Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать модуль**

```ts
import {
  MIN_MARKED_PARTICIPANTS, SLOT_MINUTES, addSlots, enumerateSlots, slotKey,
  type Interval, type Window,
} from '@/lib/calendar/slots'
import { busyAt, type BusyBlock } from '@/lib/calendar/busy'
import { hasAnyIn } from '@/lib/calendar/availability-intervals'

export interface ParticipantAvailability {
  ref: string
  intervals: Interval[]
  /** Встречи этого человека во всех его кругах. */
  busy: BusyBlock[]
}

export interface OverlapCell {
  slotStart: Date
  freeRefs: string[]
  busyRefs: string[]
  idleRefs: string[]
}

export interface OverlapResult {
  cells: Map<string, OverlapCell>
  /** Участники, у которых есть хоть одна отметка в окне — знаменатель. */
  markedRefs: string[]
  /** Клетки, с которых можно начать встречу. */
  candidateStarts: Set<string>
  /** Все клетки, покрытые хотя бы одним кандидатом — для подсветки. */
  candidateCovered: Set<string>
}

export function computeOverlap(input: {
  participants: ParticipantAvailability[]
  window: Window
  now: Date
  durationMinutes: number
  /** Неотменённые встречи самого круга. */
  circleBusy: BusyBlock[]
}): OverlapResult {
  const { participants, window, now, durationMinutes, circleBusy } = input

  const freeSets = new Map<string, Set<string>>()
  for (const participant of participants) {
    const keys = new Set<string>()
    for (const interval of participant.intervals) {
      for (const key of enumerateSlots(interval)) keys.add(key)
    }
    freeSets.set(participant.ref, keys)
  }

  const markedRefs = participants
    .filter((participant) => hasAnyIn(participant.intervals, window))
    .map((participant) => participant.ref)

  const cells = new Map<string, OverlapCell>()
  for (let slot = new Date(window.start); slot < window.end; slot = addSlots(slot, 1)) {
    const key = slotKey(slot)
    const freeRefs: string[] = []
    const busyRefs: string[] = []
    const idleRefs: string[] = []
    for (const participant of participants) {
      if (busyAt(participant.busy, slot)) busyRefs.push(participant.ref)
      else if (freeSets.get(participant.ref)!.has(key)) freeRefs.push(participant.ref)
      else idleRefs.push(participant.ref)
    }
    cells.set(key, { slotStart: new Date(slot), freeRefs, busyRefs, idleRefs })
  }

  const candidateStarts = new Set<string>()
  const candidateCovered = new Set<string>()

  if (markedRefs.length >= MIN_MARKED_PARTICIPANTS) {
    const span = durationMinutes / SLOT_MINUTES
    const startFloor = now.getTime()
    for (let slot = new Date(window.start); slot < window.end; slot = addSlots(slot, 1)) {
      if (slot.getTime() < startFloor) continue
      if (addSlots(slot, span).getTime() > window.end.getTime()) break

      let ok = true
      for (let step = 0; step < span; step++) {
        const stepStart = addSlots(slot, step)
        const cell = cells.get(slotKey(stepStart))
        if (!cell) { ok = false; break }
        if (busyAt(circleBusy, stepStart)) { ok = false; break }
        if (!markedRefs.every((ref) => cell.freeRefs.includes(ref))) { ok = false; break }
      }
      if (!ok) continue

      candidateStarts.add(slotKey(slot))
      for (let step = 0; step < span; step++) candidateCovered.add(slotKey(addSlots(slot, step)))
    }
  }

  return { cells, markedRefs, candidateStarts, candidateCovered }
}
```

- [ ] **Шаг 4: Прогнать тест**

```bash
npx jest lib/calendar/__tests__/overlap.test.ts
```

Ожидается: PASS. Если тест «прошедшее время кандидатом не бывает» падает — проверить, что `now` сравнивается с началом слота, а не с концом.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/overlap.ts lib/calendar/__tests__/overlap.test.ts
git commit -m "feat: расчёт наложения и правило кандидата на встречу"
```

---

## Задача 6: Адрес страницы

**Файлы:**
- Создать: `lib/calendar/slug.ts`
- Создать: `lib/calendar/__tests__/slug.test.ts`

**Интерфейсы:**
- Отдаёт дальше: `slugifyTitle(title: string): string`, `buildSlug(title: string, position: number, taken: ReadonlySet<string>): string`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
import { slugifyTitle, buildSlug } from '@/lib/calendar/slug'

describe('slug', () => {
  it('транслитерирует кириллицу', () => {
    expect(slugifyTitle('Заря всего')).toBe('zarya-vsego')
    expect(slugifyTitle('Щи и ёж')).toBe('shchi-i-yozh')
  })

  it('выбрасывает пунктуацию и схлопывает дефисы', () => {
    expect(slugifyTitle('Дом  листьев: роман!')).toBe('dom-listev-roman')
    expect(slugifyTitle('  Игра в бисер  ')).toBe('igra-v-biser')
  })

  it('оставляет латиницу и цифры как есть', () => {
    expect(slugifyTitle('Fahrenheit 451')).toBe('fahrenheit-451')
  })

  it('не возвращает пустую строку', () => {
    expect(slugifyTitle('«…»')).toBe('krug')
  })

  it('первый круг книги получает голый слаг, следующие — номер', () => {
    expect(buildSlug('Заря всего', 1, new Set())).toBe('zarya-vsego')
    expect(buildSlug('Заря всего', 2, new Set())).toBe('zarya-vsego-2')
  })

  it('обходит занятые адреса', () => {
    expect(buildSlug('Заря всего', 1, new Set(['zarya-vsego']))).toBe('zarya-vsego-2')
    expect(buildSlug('Заря всего', 2, new Set(['zarya-vsego-2']))).toBe('zarya-vsego-3')
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/slug.test.ts
```

Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать модуль**

```ts
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

const FALLBACK_SLUG = 'krug'

export function slugifyTitle(title: string): string {
  const transliterated = [...title.toLowerCase()]
    .map((char) => (char in TRANSLIT ? TRANSLIT[char] : char))
    .join('')

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || FALLBACK_SLUG
}

/**
 * Первый круг книги получает голый слаг, следующие — суффикс с номером.
 * Если адрес занят другой книгой, суффикс увеличивается до свободного.
 */
export function buildSlug(title: string, position: number, taken: ReadonlySet<string>): string {
  const base = slugifyTitle(title)
  let candidate = position <= 1 ? base : `${base}-${position}`
  let suffix = position <= 1 ? 1 : position
  while (taken.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}
```

- [ ] **Шаг 4: Прогнать тест**

```bash
npx jest lib/calendar/__tests__/slug.test.ts
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/slug.ts lib/calendar/__tests__/slug.test.ts
git commit -m "feat: генерация адреса страницы календаря"
```

---

## Задача 7: Резолв адреса и состав круга

**Файлы:**
- Создать: `lib/calendar/schedule-db.ts`
- Создать: `lib/calendar/__tests__/schedule-db.test.ts`

**Интерфейсы:**
- Использует: `buildSlug` из `lib/calendar/slug.ts`; таблицы из `lib/db/schema.ts`; `withAuditContext`.
- Отдаёт дальше:
  - `resolveScheduleBySlug(slug: string): Promise<ResolvedSchedule | null>`
  - `ensureScheduleForCircle(input: { sessionId: string; bookId: string; position: number; bookTitle: string }): Promise<ResolvedSchedule>`
  - тип `ResolvedSchedule` с полями `id`, `sessionId`, `bookId`, `position`, `slug`, `durationMinutes`, `bookTitle`, `bookAuthor`, `circleId: string | null`, `members: CircleMember[]`
  - тип `CircleMember` с полями `userId`, `ref`, `displayName`, `timezone`

`circleId === null` означает «круга с таким номером больше нет»: книга распалась или админ удалил круг. Страница в этом состоянии показывает баннер и уже назначенные встречи, но не даёт редактировать.

`ref` — публичный идентификатор участника, наружу `userId` не отдаётся. Взять ту же схему, что использует `buildPublicBookModeState` в `lib/matching/book-public-state.ts` — сначала прочитать этот файл и повторить способ построения `publicRef`, а не изобретать свой.

- [ ] **Шаг 1: Написать падающий тест на ленивое создание**

Тест мокает базу — образец мокинга взять из существующих тестов в `lib/matching/__tests__/`. Проверяются два поведения: повторный вызов не создаёт вторую строку и слаг выбирается с учётом занятых.

```ts
import { pickSlugForCircle } from '@/lib/calendar/schedule-db'

describe('pickSlugForCircle', () => {
  it('первый круг книги получает голый слаг', () => {
    expect(pickSlugForCircle('Заря всего', 1, ['dom-listev'])).toBe('zarya-vsego')
  })

  it('второй круг книги получает номер', () => {
    expect(pickSlugForCircle('Заря всего', 2, ['zarya-vsego'])).toBe('zarya-vsego-2')
  })

  it('обходит чужой занятый адрес', () => {
    expect(pickSlugForCircle('Заря всего', 2, ['zarya-vsego', 'zarya-vsego-2'])).toBe('zarya-vsego-3')
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest lib/calendar/__tests__/schedule-db.test.ts
```

Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать модуль**

Экспортировать чистую обёртку `pickSlugForCircle(title, position, takenSlugs)` поверх `buildSlug` — она тестируется без базы, остальное покрывается интеграционными тестами из задачи 15.

Ключевые запросы:

- `resolveScheduleBySlug` — один `select` из `circleSchedules` по слагу с `innerJoin` на `books`; затем `select` из `matchingCircles` по `(sessionId, bookId, position)`; если круг найден — `select` из `matchingBookAssignments` с `innerJoin` на `users` по `circleId`.
- `ensureScheduleForCircle` — `select` существующей строки по `(sessionId, bookId, position)`; если нет, внутри `withAuditContext({ actorUserId: null, source: 'system' }, …)` прочитать занятые слаги (`select slug from circle_schedules`) и вставить новую строку. На гонку двух одновременных первых заходов повесить `onConflictDoNothing` по `circle_schedules_session_book_position_uniq` и перечитать строку после вставки.

Создание пространства — системное действие, а не пользовательское, поэтому `source: 'system'` и `actorUserId: null`.

- [ ] **Шаг 4: Прогнать тест и типы**

```bash
npx jest lib/calendar/__tests__/schedule-db.test.ts && npm run typecheck
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/schedule-db.ts lib/calendar/__tests__/schedule-db.test.ts
git commit -m "feat: резолв адреса календаря и состав круга"
```

---

## Задача 8: Чтение состояния календаря

**Файлы:**
- Создать: `lib/calendar/public-state.ts`
- Создать: `app/api/calendar/[slug]/route.ts`
- Создать: `app/api/calendar/[slug]/route.test.ts`

**Интерфейсы:**
- Использует: всё из задач 2–7.
- Отдаёт дальше: тип `CalendarPublicState`, потребляемый всеми компонентами.

```ts
export interface CalendarPublicState {
  slug: string
  book: { title: string; author: string | null }
  position: number
  circleExists: boolean
  durationMinutes: number
  window: { start: string; end: string }
  now: string
  participants: Array<{
    ref: string
    displayName: string
    timezone: string | null
    marked: boolean
    intervals: Array<{ startsAt: string; endsAt: string }>
    busy: Array<{ startsAt: string; endsAt: string; bookTitle: string }>
  }>
  meetings: Array<{
    id: string
    startsAt: string
    durationMinutes: number
    createdByName: string | null
    canceledAt: string | null
  }>
  viewer: {
    ref: string | null
    canEdit: boolean
    isAdmin: boolean
    actingAsRef: string | null
    timezone: string | null
    timezoneConfirmed: boolean
  }
  migrationRequired: boolean
}
```

Наружу отдаются `ref`, а не `userId`. Чужие занятости отдаются без указания книги для всех, кроме владельца слота: название книги другого круга — лишнее раскрытие. Владелец получает своё `bookTitle`, остальным приходит `bookTitle: null`.

- [ ] **Шаг 1: Написать падающий тест роута**

Образец мокинга `auth` и базы взять из соседних route-тестов, например `app/api/matching/state/route.test.ts`. Проверяются:

```ts
describe('GET /api/calendar/[slug]', () => {
  it('отдаёт 404 на неизвестный слаг', async () => { /* … */ })
  it('анонимному отдаёт состояние с canEdit=false', async () => { /* … */ })
  it('участнику круга отдаёт canEdit=true и его ref', async () => { /* … */ })
  it('не отдаёт userId ни в одном поле ответа', async () => {
    const body = JSON.stringify(await response.json())
    expect(body).not.toContain(memberUserId)
  })
  it('чужую занятость отдаёт без названия книги', async () => { /* … */ })
  it('при отсутствии таблиц отвечает migrationRequired вместо 500', async () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest app/api/calendar/
```

Ожидается: FAIL — роута нет.

- [ ] **Шаг 3: Реализовать**

`lib/calendar/public-state.ts` собирает состояние: резолвит слаг, читает интервалы участников за окно, читает встречи этого круга и встречи участников в других кругах, зовёт `computeOverlap` только на сервере для перепроверки — клиенту отдаются исходные интервалы, а сетку он считает сам тем же модулем.

Роут `app/api/calendar/[slug]/route.ts`:

```ts
export const dynamic = 'force-dynamic'
```

`GET` — без обязательной авторизации. `PATCH` — меняет `durationMinutes` (участник круга или админ) и `slug` (только админ), обе мутации внутри `withAuditContext`.

Защита до прогона миграции: обернуть чтение в `try/catch`, при ошибке отсутствующего отношения (`code === '42P01'`) вернуть `{ migrationRequired: true }` со статусом 200, а не 500. То же самое делают мутирующие роуты, но отвечают `409`.

Чистка прошлого: в той же транзакции удалять строки `user_availability`, целиком лежащие раньше `window.start` (`ends_at <= window.start`). Отдельного cron нет — спека прямо это оговаривает. Удаление идёт через `withAuditContext` с `source: 'system'` и `actorUserId: null`, потому что это системная уборка, а не действие человека. Добавить тест: `it('удаляет отметки, целиком оставшиеся в прошлом', …)` и парный `it('не трогает отметку, пересекающую границу окна', …)` — вторая должна остаться целой, обрезкой занимается `clampToWindow` на чтении, а не удаление.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest app/api/calendar/ && npm run typecheck
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add lib/calendar/public-state.ts app/api/calendar/
git commit -m "feat: чтение состояния календаря круга"
```

---

## Задача 9: Сохранение своего времени и часового пояса

**Файлы:**
- Создать: `app/api/calendar/availability/route.ts`
- Создать: `app/api/calendar/availability/route.test.ts`
- Создать: `app/api/profile/timezone/route.ts`
- Создать: `app/api/profile/timezone/route.test.ts`

**Интерфейсы:**
- Использует: `normalize`, `clampToWindow` из `lib/calendar/availability-intervals.ts`; `windowBounds`, `isSlotAligned` из `lib/calendar/slots.ts`.
- Отдаёт дальше: `PUT /api/calendar/availability`, `PATCH /api/profile/timezone`.

`PUT` принимает **полный набор** интервалов пользователя в окне, а не дельту: так параллельная правка с двух устройств не даёт рассинхрона. Сервер нормализует, обрезает по окну, удаляет прежние строки пользователя в окне и вставляет новые — всё в одной транзакции `withAuditContext`. Интервалы вне окна не трогаются.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
describe('PUT /api/calendar/availability', () => {
  it('без авторизации отвечает 401', async () => { /* … */ })
  it('отклоняет интервалы не по получасовой сетке', async () => {
    // 17:15 → 400 с кодом 'unaligned_interval'
  })
  it('отклоняет интервал с концом раньше начала', async () => { /* … */ })
  it('склеивает пересекающиеся перед записью', async () => { /* … */ })
  it('обрезает по окну и не трогает прошлое', async () => { /* … */ })
  it('админ с ?as= пишет за другого, actor в аудите административный', async () => { /* … */ })
  it('обычный пользователь с ?as= получает 403', async () => { /* … */ })
})

describe('PATCH /api/profile/timezone', () => {
  it('сохраняет пояс и поднимает флаг подтверждения', async () => { /* … */ })
  it('отклоняет неизвестный IANA-идентификатор', async () => {
    // проверка через Intl.supportedValuesOf('timeZone') либо try/catch на Intl.DateTimeFormat
  })
  it('принимает confirmed=false для автоматического определения из браузера', async () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
npx jest app/api/calendar/availability app/api/profile/timezone
```

Ожидается: FAIL — роутов нет.

- [ ] **Шаг 3: Реализовать**

Валидация пояса — через попытку построить `Intl.DateTimeFormat(undefined, { timeZone: value })` в `try/catch`: неизвестный идентификатор бросает `RangeError`. Не хардкодить список.

Разбор `?as=` повторяет то, что делает `app/api/matching/sessions/[id]/book-actions/route.ts` — прочитать его и повторить проверку админа и подстановку `actorUserId` в аудит-контекст.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest app/api/calendar app/api/profile && npm run typecheck
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add app/api/calendar/availability app/api/profile/timezone
git commit -m "feat: сохранение свободного времени и часового пояса"
```

---

## Задача 10: Назначение и отмена встречи

**Файлы:**
- Создать: `app/api/calendar/[slug]/meetings/route.ts`
- Создать: `app/api/calendar/[slug]/meetings/route.test.ts`
- Создать: `app/api/calendar/[slug]/meetings/[id]/route.ts`
- Создать: `app/api/calendar/[slug]/meetings/[id]/route.test.ts`

**Интерфейсы:**
- Использует: `computeOverlap` из `lib/calendar/overlap.ts`, `resolveScheduleBySlug` из `lib/calendar/schedule-db.ts`.
- Отдаёт дальше: `POST /api/calendar/[slug]/meetings`, `DELETE /api/calendar/[slug]/meetings/[id]`.

Сервер перепроверяет **всё правило кандидата** через тот же `computeOverlap`, а не только «слот не в прошлом». Клиентский расчёт — подсказка, не разрешение.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
describe('POST /api/calendar/[slug]/meetings', () => {
  it('создаёт встречу на клетке-кандидате', async () => { /* … */ })
  it('отклоняет слот, где отметившиеся свободны не все', async () => {
    // 409 с кодом 'not_a_candidate'
  })
  it('отклоняет слот в прошлом', async () => { /* … */ })
  it('отклоняет слот, пересекающийся с уже назначенной встречей круга', async () => { /* … */ })
  it('отклоняет запрос от не участника круга', async () => { /* … */ })
  it('снимает длительность снимком в момент создания', async () => {
    // после смены durationMinutes у пространства старая встреча сохраняет свою длину
  })
  it('распавшийся круг не даёт назначать', async () => {
    // circleId === null → 409 'circle_gone'
  })
})

describe('DELETE /api/calendar/[slug]/meetings/[id]', () => {
  it('проставляет canceled_at и canceled_by, не удаляя строку', async () => { /* … */ })
  it('освобождает время: повторный расчёт делает слот кандидатом', async () => { /* … */ })
  it('повторная отмена не меняет запись', async () => { /* … */ })
  it('отклоняет запрос от не участника круга', async () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
npx jest app/api/calendar/
```

Ожидается: FAIL — роутов нет.

- [ ] **Шаг 3: Реализовать**

`POST` внутри одной транзакции `withAuditContext`: читает состав круга и интервалы, строит `computeOverlap` с актуальным `now`, проверяет `candidateStarts.has(slotKey(startsAt))`, вставляет строку. Доменные коды ошибок (`not_a_candidate`, `circle_gone`, `not_a_member`) клиент переводит в человеческий текст сам, наружу коды не показываются.

`DELETE` — `update` с `canceledAt`/`canceledBy`, `where` дополнительно требует `isNull(canceledAt)`, чтобы повтор был идемпотентным.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest app/api/calendar && npm run typecheck
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add app/api/calendar/[slug]/meetings
git commit -m "feat: назначение и отмена встречи круга"
```

---

## Задача 11: Сетка и закрашивание

**Файлы:**
- Создать: `components/nd/CalendarGrid.tsx`
- Создать: `components/nd/CalendarGrid.test.tsx`

**Интерфейсы:**
- Использует: `OverlapResult` из `lib/calendar/overlap.ts`, `CalendarPublicState` из `lib/calendar/public-state.ts`.
- Отдаёт дальше: компонент `CalendarGrid` со свойствами `columns`, `slotRange`, `overlap`, `viewerFreeKeys`, `focusRef`, `canEdit`, `onPaint(key, mode)`, `onCellClick(key)`, `selectedKey`, `isMobile`, `participantCount`.

Разметка, размеры и классы берутся из прототипа `docs/design/circle-calendar/grid.jsx` и `calendar.css`. Переносится один в один, кроме цветов: `rgba(45,106,79,α)` заменяется на `color-mix(in srgb, var(--success) N%, transparent)`, где N — та же доля в процентах. Соответствие: частичное наложение `10% + 28% × доля свободных`, полное пересечение `62%`, своё время — уголок `color-mix(in srgb, var(--success-hover) 85%, transparent)`.

Ключевые поведения, которые обязаны сохраниться:
- клик красит блок длиной встречи, протягивание — по одной получасовке;
- режим протягивания определяется первой клеткой: попал на свою — стираешь, на чужую — красишь;
- на телефоне протягивание включается после удержания ~320 мс, до этого `touch-action: pan-y`, во время закрашивания `none`;
- сетка не перестраивается от собственных правок в течение сессии.

- [ ] **Шаг 1: Написать падающий тест**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarGrid } from '@/components/nd/CalendarGrid'

describe('CalendarGrid', () => {
  it('рисует по колонке на день и по строке на получасовку', () => { /* … */ })
  it('клик по клетке красит блок длиной встречи', async () => {
    // onPaint вызван для двух ключей подряд при длительности 60
  })
  it('клик по своей клетке снимает тот же блок', async () => { /* … */ })
  it('клик по своей клетке внутри полного пересечения открывает попап, а не стирает', async () => {
    // onCellClick вызван, onPaint — нет
  })
  it('не даёт красить прошедшие клетки', async () => { /* … */ })
  it('в режиме просмотра не вызывает onPaint вовсе', async () => { /* … */ })
  it('на клетке-кандидате показывает кнопку назначения при наведении', async () => { /* … */ })
  it('фильтр по участнику показывает только его время', () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest components/nd/CalendarGrid.test.tsx
```

Ожидается: FAIL — компонента нет.

- [ ] **Шаг 3: Реализовать компонент**

Портировать `docs/design/circle-calendar/grid.jsx` на TypeScript. Стили — inline `style={{…}}` с `var(--…)`, как принято в `components/nd/*`. Проверить командой, что литеральных цветов не осталось:

```bash
grep -nE "rgba?\(|#[0-9a-fA-F]{3,6}" components/nd/CalendarGrid.tsx
```

Ожидается: пусто.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest components/nd/CalendarGrid.test.tsx && npm run lint
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add components/nd/CalendarGrid.tsx components/nd/CalendarGrid.test.tsx
git commit -m "feat: сетка календаря с закрашиванием и наложением"
```

---

## Задача 12: Попап клетки, состав круга и легенда

**Файлы:**
- Создать: `components/nd/CalendarCellPopover.tsx`
- Создать: `components/nd/CalendarCellPopover.test.tsx`
- Создать: `components/nd/CalendarParticipants.tsx`
- Создать: `components/nd/CalendarParticipants.test.tsx`
- Создать: `components/nd/CalendarLegend.tsx`

**Интерфейсы:**
- Отдаёт дальше: три компонента, потребляемые `CalendarClient` в задаче 13.

Разметка — из `docs/design/circle-calendar/app.jsx`, функция `CellPopover` и блок `.side`.

- [ ] **Шаг 1: Написать падающие тесты**

```tsx
describe('CalendarCellPopover', () => {
  it('перечисляет всех участников круга с их статусом', () => {
    // свободен / занято другой книгой / нет отметки
  })
  it('показывает локальное время каждого участника', () => {
    // «свободно · 20:00 у себя» для участника в другом поясе
  })
  it('считает знаменатель от отметившихся, а не от размера круга', () => {
    // круг из 5, отметились 3, все свободны → «свободны 3 из 3»
  })
  it('называет не отметившихся отдельной строкой', () => {
    // «не отмечались: Аня»
  })
  it('показывает кнопку назначения только на кандидате', () => { /* … */ })
  it('в режиме просмотра не показывает ни одной кнопки действия', () => { /* … */ })
  it('закрывается по Escape', async () => { /* … */ })
})

describe('CalendarParticipants', () => {
  it('показывает весь состав круга, включая не отметившихся', () => { /* … */ })
  it('помечает не отметившихся подписью «ещё не отмечался»', () => { /* … */ })
  it('помечает смотрящего подписью «· вы»', () => { /* … */ })
  it('по клику на имя включает и выключает фильтр', async () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
npx jest components/nd/CalendarCellPopover.test.tsx components/nd/CalendarParticipants.test.tsx
```

Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать компоненты**

`CalendarLegend` принимает `markedCount` и строит шкалу от него, а не от числа 4: подпись «1 → N свободны», где N — число отметившихся.

Попап на мобильном — нижний лист с focus trap и возвратом фокуса, как это уже сделано в `components/nd/MatchingBookDetailModal.tsx`: прочитать его и повторить механику, а не писать заново.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest components/nd/Calendar && npm run lint
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add components/nd/CalendarCellPopover.tsx components/nd/CalendarCellPopover.test.tsx components/nd/CalendarParticipants.tsx components/nd/CalendarParticipants.test.tsx components/nd/CalendarLegend.tsx
git commit -m "feat: попап клетки, состав круга и легенда календаря"
```

---

## Задача 13: Страница целиком

**Файлы:**
- Создать: `app/calendar/[slug]/page.tsx`
- Создать: `components/nd/CalendarClient.tsx`
- Создать: `components/nd/CalendarClient.test.tsx`
- Создать: `components/nd/CalendarMeetingCard.tsx`
- Создать: `components/nd/CalendarTimezoneBar.tsx`

**Интерфейсы:**
- Использует: всё из задач 8–12.
- Отдаёт дальше: рабочую страницу `/calendar/<slug>`.

Раскладка и все пять состояний — из прототипа `docs/design/circle-calendar/app.jsx`. Состояния: пусто, закрашено, есть встреча, только прошедшие, круг распался. Плюс три баннера: аноним, админский режим `?as=`, круг распался. Плюс заглушка `migrationRequired` — оформляется по образцу баннера «круг распался».

Дефолт обрезки зависит от смотрящего: у кого нет своих отметок, тот видит все дни подряд. Это защита от анкоринга — иначе второй заполняющий видел бы только дни, выбранные первым.

- [ ] **Шаг 1: Написать падающий тест**

```tsx
describe('CalendarClient', () => {
  it('без встреч показывает развёрнутую сетку', () => { /* … */ })
  it('со встречей показывает карточку сверху и сворачивает сетку', () => { /* … */ })
  it('по кнопке «Назначить ещё встречу» разворачивает сетку обратно', async () => { /* … */ })
  it('прошедшие встречи прячет в свёрнутый список', () => { /* … */ })
  it('у смотрящего без своих отметок обрезка выключена', () => { /* … */ })
  it('у смотрящего со своими отметками обрезка включена', () => { /* … */ })
  it('анонимному показывает баннер и не даёт красить', () => { /* … */ })
  it('в админском режиме показывает баннер с именем того, за кого действуем', () => { /* … */ })
  it('при circleExists=false показывает баннер и прячет действия, но показывает встречи', () => { /* … */ })
  it('при migrationRequired показывает заглушку вместо сетки', () => { /* … */ })
  it('отмена встречи идёт через диалог подтверждения', async () => {
    // клик «Отменить» открывает диалог, запрос уходит только после подтверждения
  })
  it('полоса пояса скрывает вопрос после подтверждения', async () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

```bash
npx jest components/nd/CalendarClient.test.tsx
```

Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`app/calendar/[slug]/page.tsx` — серверный компонент: читает состояние, отдаёт в `CalendarClient`. Метаданные страницы — название книги и номер круга. Индексацию не блокируем: решение владельца проекта.

`CalendarTimezoneBar` при монтировании определяет пояс через `Intl.DateTimeFormat().resolvedOptions().timeZone` и, если у пользователя пояс ещё не сохранён, молча отправляет `PATCH /api/profile/timezone` с `confirmed: false`. Кнопка «Верно» отправляет `confirmed: true`.

Сохранение закрашенного — с задержкой около 400 мс после последнего изменения, отправляется полный набор интервалов. Во время полёта запроса интерфейс не блокируется.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npx jest components/nd/CalendarClient.test.tsx && npm run lint && npm run typecheck
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add app/calendar components/nd/CalendarClient.tsx components/nd/CalendarClient.test.tsx components/nd/CalendarMeetingCard.tsx components/nd/CalendarTimezoneBar.tsx
git commit -m "feat: страница календаря круга"
```

---

## Задача 14: Точка входа с доски матчинга

**Файлы:**
- Создать: `app/calendar/circle/[bookId]/[position]/route.ts`
- Создать: `app/calendar/circle/[bookId]/[position]/route.test.ts`
- Правка: `components/nd/MatchingBookCircles.tsx`
- Правка: `components/nd/MatchingBookCircles.test.tsx`

**Интерфейсы:**
- Использует: `ensureScheduleForCircle` из `lib/calendar/schedule-db.ts`.
- Отдаёт дальше: адрес-резолвер `/calendar/circle/<bookId>/<position>`, отвечающий редиректом на `/calendar/<slug>`.

Ссылка с доски ведёт **не прямо на слаг, а на резолвер**, который создаёт пространство при необходимости и перенаправляет на канонический адрес. Так сделано намеренно: положить слаг в публичное состояние matching означало бы создавать строку в базе внутри обработки `GET /api/matching/state`. Запись в read-модели — плохая идея сама по себе, а здесь ещё и заставила бы каждый опрос состояния открывать транзакцию с аудит-контекстом. Резолвер срабатывает один раз, по клику.

Идентификатор сессии в адресе не нужен: резолвер сам берёт актуальную сессию на сервере.

- [ ] **Шаг 1: Написать падающий тест резолвера**

```ts
describe('GET /calendar/circle/[bookId]/[position]', () => {
  it('создаёт пространство и редиректит на слаг', async () => {
    // 307, Location = /calendar/zarya-vsego
  })
  it('повторный заход не создаёт вторую строку и ведёт на тот же адрес', async () => { /* … */ })
  it('на несуществующий круг отвечает 404', async () => { /* … */ })
  it('до прогона миграции отвечает заглушкой, а не 500', async () => { /* … */ })
})
```

И тест карточки круга:

```tsx
describe('MatchingBookCircles', () => {
  it('участнику своего круга показывает ссылку «Согласовать время»', () => { /* … */ })
  it('чужому участнику ссылку не показывает', () => { /* … */ })
  it('админу показывает ссылку на любой круг', () => { /* … */ })
  it('ведёт на /calendar/circle/<bookId>/<position>', () => { /* … */ })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
npx jest components/nd/MatchingBookCircles.test.tsx app/calendar
```

Ожидается: FAIL — ни резолвера, ни ссылки нет.

- [ ] **Шаг 3: Реализовать**

Резолвер — обычный route handler с `export const dynamic = 'force-dynamic'`, отвечает `NextResponse.redirect(new URL(\`/calendar/${slug}\`, req.url), 307)`.

В `MatchingBookCircles.tsx` ссылка добавляется в блок круга. Условие видимости: смотрящий назначен в этот круг либо `adminMode`. Публичное состояние matching **не меняется** — `bookId` и `position` там уже есть.

- [ ] **Шаг 4: Прогнать тесты**

```bash
npm test && npm run typecheck
```

Ожидается: PASS, включая ранее написанные тесты matching.

- [ ] **Шаг 5: Коммит**

```bash
git add app/calendar/circle components/nd/MatchingBookCircles.tsx components/nd/MatchingBookCircles.test.tsx
git commit -m "feat: ссылка на календарь в карточке круга"
```

---

## Задача 15: Сквозные тесты

**Файлы:**
- Создать: `e2e/calendar.spec.ts`
- Создать: `e2e/calendar-layout.spec.ts`

**Интерфейсы:**
- Использует: фикстуры из `e2e/fixtures.ts`.

**Прежде чем писать хоть строчку — прочитать `docs/features/testing.md` целиком.** Там расписаны обязательная изоляция от прод-базы, live-locators, гонки и грабли, на которые проект уже наступал.

Все мутации только через фикстуру с cleanup в teardown. Прод-данные не редактируются.

- [ ] **Шаг 1: Написать сценарии персистентности**

```ts
test('закрашенное время переживает перезагрузку', async ({ page }) => {
  // закрасить клетку → page.reload() → клетка всё ещё своя
})

test('назначенная встреча переживает перезагрузку', async ({ page }) => {
  // назначить → page.reload() → карточка встречи на месте, сетка свёрнута
})

test('встреча в одном круге занимает время во втором', async ({ page }) => {
  // назначить в круге A → открыть круг B того же человека → слот занят
})

test('отмена встречи освобождает время в обоих кругах', async ({ page }) => {
  // отменить → в круге B слот снова свободен
})

test('анонимный видит сетку, но не может править', async ({ page }) => {
  // без входа: сетка есть, попытка клика не создаёт запрос
})

test('админ через ?as= красит за другого', async ({ page }) => {
  // проверить запись в audit_log: actor административный, subject — тот, за кого действовали
})

test('не отметившийся участник не блокирует назначение', async ({ page }) => {
  // круг из трёх, двое отметились и совпали, третий молчит → кнопка есть
})
```

- [ ] **Шаг 2: Прогнать фокусно**

```bash
npm run test:e2e:focused -- e2e/calendar.spec.ts
```

Ожидается: PASS — к этому моменту функциональность уже реализована задачами 1–14, эти тесты её подтверждают, а не ведут разработку. Любое падение здесь означает реальный дефект интеграции: чинить его, а не подгонять тест.

Фокусный прогон выполняется без retry и обязан выбрать хотя бы один тест — если выбрано ноль, проверить имя файла и `--grep`.

- [ ] **Шаг 3: Написать layout-тест**

```ts
test('геометрия клетки на десктопе', async ({ page }) => {
  // boundingBox() клетки: высота 22, ширина колонки > 0, страница не скроллится вбок
})

test('геометрия клетки на мобильном', async ({ page }) => {
  // 375×812: высота 26, семь колонок помещаются, нет горизонтального переполнения
})

test('попап на мобильном становится нижним листом', async ({ page }) => {
  // boundingBox() попапа прижат к низу, ширина равна ширине экрана
})
```

Проверка «страница не скроллится вбок» обязательна: узкая колонка на телефоне — главное место, где это ломается.

- [ ] **Шаг 4: Прогнать layout фокусно**

```bash
npm run test:e2e:focused -- e2e/calendar-layout.spec.ts
```

Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add e2e/calendar.spec.ts e2e/calendar-layout.spec.ts
git commit -m "test: сквозные и layout-тесты календаря круга"
```

---

## Задача 16: Документация

**Файлы:**
- Создать: `docs/features/calendar.md`
- Правка: `docs/wiki/` — страница про matching и страница про схему БД
- Правка: `CLAUDE.md` — строка про календарь в разделе ключевых файлов

- [ ] **Шаг 1: Написать техническое описание**

`docs/features/calendar.md` по образцу `docs/features/matching.md`: модель данных, правило кандидата, адресация страницы парой «книга + номер круга» и почему не по идентификатору, порядок прогона миграции `0062`, список эндпоинтов, известные следствия из спеки.

- [ ] **Шаг 2: Обновить вики**

Обязательно, потому что меняются пользовательская фича, схема БД и набор эндпоинтов. Прочитать существующие страницы `docs/wiki/`, дописать раздел про согласование встреч и связь календаря с матчингом. Синхронизация в GitHub Wiki произойдёт автоматически при merge в `main`.

- [ ] **Шаг 3: Коммит**

```bash
git add docs/features/calendar.md docs/wiki CLAUDE.md
git commit -m "docs: описание календаря круга"
```

---

## Выкатка

После merge PR в `main` и деплоя на production оператор вручную прогоняет миграцию:

```bash
node --env-file=.env.local scripts/apply-migration.mjs drizzle/0062_calendar.sql
```

До прогона страница календаря отдаёт заглушку «функция ещё не включена», мутации отвечают `409` — это проверяется тестами из задач 8–10. После прогона всё включается само, без флага.

Последняя проверка — на живом телефоне: закрашивание пальцем и отсутствие горизонтальной прокрутки. Headless-браузер эти два класса багов не ловит, поэтому нужен просмотр превью с устройства владельцем проекта.

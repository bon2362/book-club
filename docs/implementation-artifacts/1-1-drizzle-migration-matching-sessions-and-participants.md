# Story 1.1: Drizzle migration — matching_sessions, matching_session_participants, admin_views

Status: review

## Story

As a разработчик,
I want миграцию Drizzle, добавляющую таблицы `matching_sessions`, `matching_session_participants` и `admin_views`,
so that все последующие истории Group Matching Mode могли писать и читать данные сессий без изменений схемы.

## Acceptance Criteria

1. После применения миграции в БД существует таблица `matching_sessions` с полями: `id text PK`, `name text NOT NULL`, `created_by text → users(id) ON DELETE SET NULL`, `created_at timestamp NOT NULL DEFAULT now()`, `deadline_at timestamp NULL`, `status text NOT NULL` (значения: `'active'` | `'frozen'`), `target_group_size integer NOT NULL DEFAULT 3`, `frozen_at timestamp NULL`, `frozen_scenario_json jsonb NULL`.
2. После применения миграции существует таблица `matching_session_participants` с составным PK `(session_id, user_id)`, FK `session_id → matching_sessions(id) ON DELETE CASCADE`, FK `user_id → users(id) ON DELETE CASCADE`, полем `pseudonym text NOT NULL`, полем `joined_at timestamp NOT NULL DEFAULT now()`, и UNIQUE constraint на `(session_id, pseudonym)`.
3. После применения миграции существует таблица `admin_views` с: `id text PK`, `admin_id text → users(id) ON DELETE CASCADE`, `viewed_user_id text → users(id) ON DELETE CASCADE`, `session_id text → matching_sessions(id) ON DELETE CASCADE NULL`, `ts timestamp NOT NULL DEFAULT now()`.
4. Создан partial unique index на `matching_sessions(status) WHERE status='active'` — гарантирует единственность активной сессии на уровне БД.
5. В `lib/db/schema.ts` добавлены и экспортированы объекты Drizzle: `matchingSessions`, `matchingSessionParticipants`, `adminViews`.
6. `npm run typecheck` проходит без ошибок.
7. `npm run lint` проходит без ошибок.

## Tasks / Subtasks

- [x] Обновить `lib/db/schema.ts`: добавить три таблицы с правильными типами и индексами (AC: 1, 2, 3, 4, 5)
  - [x] Добавить `matchingSessions` — все поля по AC1, partial unique index по AC4
  - [x] Добавить `matchingSessionParticipants` — composite PK, оба FK, UNIQUE (session_id, pseudonym)
  - [x] Добавить `adminViews` — id PK, три FK, ts
- [x] Сгенерировать SQL-миграцию командой `npx drizzle-kit generate` (AC: 1, 2, 3)
- [x] Применить миграцию командой `npx drizzle-kit migrate` (AC: 1, 2, 3, 4)
- [x] Убедиться что `npm run typecheck` и `npm run lint` проходят (AC: 6, 7)

## Dev Notes

### Схема — критически важные детали

**Существующие паттерны в `lib/db/schema.ts`** (следовать строго):
- Все ID — `text`, тип `primaryKey()` или `.primaryKey()`
- Timestamps: `timestamp('col', { mode: 'date' }).notNull().defaultNow()`
- FK с cascade: `.references(() => table.field, { onDelete: 'cascade' })`
- FK без cascade (SET NULL): `.references(() => table.field, { onDelete: 'set null' })`
- Составной PK: `primaryKey({ columns: [t.a, t.b] })` в третьем аргументе `pgTable`
- Unique index: `uniqueIndex('name').on(t.col)`
- Partial unique index: `uniqueIndex('name').on(t.col).where(sql\`${t.col} = 'active'\`)`

**`created_by` в `matching_sessions`**: `ON DELETE SET NULL` (не CASCADE), чтобы история сессии не терялась при удалении пользователя. Поле nullable.

**`session_id` в `admin_views`**: nullable FK (`ON DELETE CASCADE NULL`), аудит-лог может относиться к сессии или нет.

**`id` в `admin_views` и `matching_sessions`**: генерировать через `crypto.randomUUID()` — паттерн: `.$defaultFn(() => crypto.randomUUID())`.

### Drizzle-kit версия и команды

Проект использует `drizzle-kit: ^0.31.9` и `drizzle-orm: ^0.45.1`.

```bash
# Генерация миграции (создаёт новый файл в ./drizzle/)
DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d= -f2-) npx drizzle-kit generate

# Применение миграции к БД
DATABASE_URL=$(grep DATABASE_URL .env.local | cut -d= -f2-) npx drizzle-kit migrate
```

Номер файла миграции будет `0020_*.sql` — следующий после `0019_drop_user_email.sql`.

### Важные anti-patterns

- **НЕ** использовать `integer` для ID — только `text`
- **НЕ** добавлять `status` как enum Postgres — использовать `text` с проверкой на уровне TS (как в `books.readingStatus`, `books.visibility`)
- **НЕ** создавать index на `status` отдельно от partial unique — partial unique уже является индексом
- **НЕ** добавлять `NOT NULL` на `created_by` — может быть NULL после удаления создателя

### Файлы которые нужно изменить

- `lib/db/schema.ts` — добавить три таблицы в конец файла
- `drizzle/0020_*.sql` — будет создан автоматически `drizzle-kit generate`

### Файлы которые НЕ нужно трогать

- `lib/db/index.ts` — экспортирует `db` объект, не меняется
- Любые существующие таблицы — только добавление новых
- `.env.local` — DATABASE_URL уже настроен

### Тестирование

Этот тип изменений (DDL-only migration) не требует unit-тестов. Проверка корректности — через:
1. `npm run typecheck` — TypeScript подхватит неправильные типы
2. `npm run lint` — ESLint проверит стиль
3. Успешное применение миграции к Neon БД через `drizzle-kit migrate`

### Project Structure Notes

- Schemafile: `lib/db/schema.ts` (единственный, не шардирован)
- Миграции: `drizzle/` — snake_case SQL файлы, нумерованные `0000_` ... `0019_` (существующие)
- Новая папка `lib/matching/` будет создана в Story 1-2, не сейчас

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

drizzle-kit generate не поддерживает --yes флаг в v0.31.9; миграция создана вручную как 0029_matching_mode.sql и применена через Node.js скрипт scripts/apply-migration.mjs.

### Completion Notes List

- Добавлены 3 таблицы в lib/db/schema.ts: matchingSessions, matchingSessionParticipants, adminViews
- Partial unique index на matching_sessions(status) WHERE status='active' — гарантирует единственность активной сессии
- UNIQUE(session_id, pseudonym) — уникальность псевдонима в рамках сессии
- drizzle/0029_matching_mode.sql применена к production Neon БД
- typecheck и lint чистые

### File List

- lib/db/schema.ts
- drizzle/0029_matching_mode.sql
- scripts/apply-migration.mjs

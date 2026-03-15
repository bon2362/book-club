# Story 1.1: База данных и API подачи заявки

Status: done

## Story

As an authenticated user,
I want to submit a book proposal via API,
so that my submission is saved for admin review.

## Acceptance Criteria

1. **[AC1 — Happy path]** Аутентифицированный пользователь отправляет POST `/api/submissions` с валидными обязательными полями (`title`, `author`, `whyRead`) → заявка сохраняется в таблице `book_submissions` со статусом `pending` и `userId` из сессии → ответ `201 { success: true, data: { id, status: 'pending', ... } }`

2. **[AC2 — Unauthorized]** POST `/api/submissions` без валидной сессии → `401 { error: 'Unauthorized' }`

3. **[AC3 — Validation]** POST `/api/submissions` без хотя бы одного обязательного поля (`title`, `author` или `whyRead`) → `400 { error: '...' }` с описанием отсутствующего поля

4. **[AC4 — Optional fields]** POST `/api/submissions` с незаполненными необязательными полями → заявка сохраняется с `null` для `topic`, `pages`, `publishedDate`, `textUrl`, `description`, `coverUrl`

5. **[AC5 — Schema]** Таблица `book_submissions` существует в БД с колонками: `id` (uuid PK), `userId` (text NOT NULL FK → users.id), `title`, `author`, `whyRead` (NOT NULL), и необязательными `topic`, `pages` (integer), `publishedDate`, `textUrl`, `description`, `coverUrl` (text), `status` (default `'pending'`), `createdAt`, `updatedAt`

## Tasks / Subtasks

- [x] Task 1: Добавить `bookSubmissions` в `lib/db/schema.ts` (AC: #5)
  - [x] Импортировать `uuid` из `drizzle-orm/pg-core` (или использовать `crypto.randomUUID()` через `$defaultFn`)
  - [x] Определить таблицу согласно архитектурной схеме
  - [x] Добавить индекс на `status` через `index()` из `drizzle-orm/pg-core`

- [x] Task 2: Запустить миграцию через drizzle-kit (AC: #5)
  - [x] `npx drizzle-kit generate` → создаёт SQL-файл миграции
  - [x] `npx drizzle-kit migrate` → применяет к Neon Postgres
  - [x] Убедиться, что новая таблица создана без ошибок

- [x] Task 3: Создать `app/api/submissions/route.ts` с POST-обработчиком (AC: #1, #2, #3, #4)
  - [x] Auth guard через `auth()` из `@/lib/auth` → 401 при отсутствии сессии
  - [x] Парсинг и валидация body: проверка `title`, `author`, `whyRead`
  - [x] Вставка в `bookSubmissions` через Drizzle `db.insert()`
  - [x] Возврат `201` с созданной записью

- [x] Task 4: Написать тесты `app/api/submissions/route.test.ts` (AC: #1–#4)
  - [x] Мок `@/lib/auth` (паттерн как в существующих тестах)
  - [x] Мок `@/lib/db` с `db.insert().values().returning()`
  - [x] Тест: 401 без сессии
  - [x] Тест: 400 без title
  - [x] Тест: 400 без author
  - [x] Тест: 400 без whyRead
  - [x] Тест: 201 с валидными данными (все поля)
  - [x] Тест: 201 только обязательные поля (остальные null)

## Dev Notes

### КРИТИЧЕСКИ ВАЖНО: Существующая таблица `bookSuggestions`

В `lib/db/schema.ts` **уже существует** таблица `bookSuggestions` (`book_suggestions`) — это **старая таблица** с другой схемой (использует `submitterEmail` вместо FK на users, имеет поля `name`, `reason`, `link` вместо `title`, `whyRead`, `textUrl`).

**НЕ удалять, НЕ модифицировать `bookSuggestions`** — она может использоваться в существующем прото-коде.

**Нужно создать новую таблицу `bookSubmissions`** (`book_submissions`) согласно архитектуре.

### Схема таблицы (точная реализация)

```typescript
// lib/db/schema.ts — добавить после существующих таблиц:
import { pgTable, text, timestamp, integer, primaryKey, index } from 'drizzle-orm/pg-core'

export const bookSubmissions = pgTable('book_submissions', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:        text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:         text('title').notNull(),
  topic:         text('topic'),
  author:        text('author').notNull(),
  pages:         integer('pages'),
  publishedDate: text('published_date'),
  textUrl:       text('text_url'),
  description:   text('description'),
  coverUrl:      text('cover_url'),
  whyRead:       text('why_read').notNull(),
  status:        text('status').notNull().default('pending'),
  createdAt:     timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('book_submissions_status_idx').on(t.status),
}))
```

Паттерн для `$defaultFn` взят из существующей `bookSuggestions` в той же схеме.

### Структура API-маршрута (паттерн)

```typescript
// app/api/submissions/route.ts
export const dynamic = 'force-dynamic'  // как в /api/books/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions } from '@/lib/db/schema'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... валидация, insert, return 201
}
```

Auth-паттерн: `session?.user?.isAdmin` для admin-эндпоинтов, `session?.user?.id` (или `session?.user`) для user-эндпоинтов. Использовать `id` из `session.user` для `userId`.

### Паттерн ответа API

```typescript
// Успех
return NextResponse.json({ success: true, data: result[0] }, { status: 201 })
// Ошибка валидации
return NextResponse.json({ error: 'title is required' }, { status: 400 })
// Unauthorized
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Паттерн db.insert с returning

```typescript
const result = await db.insert(bookSubmissions).values({
  userId: session.user.id,
  title,
  // ... остальные поля
}).returning()
```

### `updatedAt` при insert

Drizzle не обновляет `updatedAt` автоматически при UPDATE. В Story 1.1 нужен только insert — `updatedAt` устанавливается через `.defaultNow()`. Для будущих PATCH-запросов (Story 2.2) потребуется явно передавать `updatedAt: new Date()`.

### Паттерн тестов (строго следовать)

Все тесты используют `@jest-environment node` (не jsdom). Мок DB для insert:

```typescript
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'test-uuid', status: 'pending', ... }]),
      }),
    }),
  },
}))
```

Мок auth:
```typescript
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
const mockAuth = authModule.auth as jest.Mock
```

### Файлы для изменения / создания

| Действие | Файл |
|---|---|
| Изменить | `lib/db/schema.ts` |
| Создать | `app/api/submissions/route.ts` |
| Создать | `app/api/submissions/route.test.ts` |
| Запустить | `npx drizzle-kit generate && npx drizzle-kit migrate` |

### Project Structure Notes

- `lib/db/schema.ts` — добавить `bookSubmissions` в конец файла, **не трогать** существующие таблицы
- `app/api/submissions/route.ts` — новая директория, по образцу существующих API-маршрутов в `app/api/`
- Тест рядом с исходником: `app/api/submissions/route.test.ts`
- `index` для `status` нужен для эффективной фильтрации admin-запросов (Story 2.2)

### References

- Схема таблицы: [Source: docs/planning-artifacts/architecture.md#Data Architecture]
- API-паттерны (auth, response format): [Source: docs/planning-artifacts/architecture.md#Process Patterns]
- Файловая структура: [Source: docs/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Существующий auth-паттерн: [Source: app/api/admin/route.ts]
- Существующий DB-паттерн (insert с $defaultFn): [Source: lib/db/schema.ts — bookSuggestions]
- Паттерн тестов: [Source: app/api/admin/delete-user/route.test.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Task 2: `npx drizzle-kit migrate` завершился ошибкой (таблицы уже существуют в БД, нет migration journal). Использован `npx drizzle-kit push` — сравнивает схему с БД и применяет только diff. Таблица `book_submissions` создана успешно.

### Completion Notes List

- ✅ Task 1: Добавлена таблица `bookSubmissions` в `lib/db/schema.ts`, импортирован `index` из drizzle-orm/pg-core, добавлен индекс на `status`.
- ✅ Task 2: Таблица создана в Neon DB через `drizzle-kit push` (push был предпочтительнее migrate т.к. отсутствовал migration journal в БД).
- ✅ Task 3: Создан `app/api/submissions/route.ts` с POST-обработчиком: auth guard (401), валидация обязательных полей (400), insert через Drizzle, ответ 201.
- ✅ Task 4: Написаны 7 тестов — все прошли. Полный регрессионный набор: 133/133.

### File List

- `lib/db/schema.ts` (изменён)
- `app/api/submissions/route.ts` (создан)
- `app/api/submissions/route.test.ts` (создан)
- `drizzle/0000_sudden_captain_midlands.sql` (создан drizzle-kit generate)
- `drizzle/meta/_journal.json` (создан drizzle-kit generate)
- `drizzle/meta/0000_snapshot.json` (создан drizzle-kit generate)

### Change Log

- 2026-03-15: Реализована Story 1.1 — добавлена таблица `book_submissions` в БД и API-эндпоинт POST `/api/submissions` с полной валидацией и тестами.

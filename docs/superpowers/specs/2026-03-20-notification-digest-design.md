# Дизайн: группировка email-уведомлений о новых записях (бэклог #74)

## Контекст

Сейчас при каждой новой записи на книгу организатору немедленно шлётся отдельный email через Resend. При всплеске активности (после анонса) это создаёт поток писем. Цель — накапливать уведомления и отправлять один дайджест после того как всплеск «остынет».

## Подход

**Очередь в Postgres + GitHub Actions с дебаунсом.**

Каждая новая запись на книгу сохраняется в таблицу-очередь `notification_queue`. GitHub Actions workflow (`digest.yml`) по расписанию `*/10 * * * *` вызывает эндпоинт `GET /api/cron/digest`. Тот проверяет условие дебаунса и при необходимости шлёт один дайджест.

**Почему GitHub Actions, а не Vercel Cron:** Vercel Hobby-план поддерживает только ежедневные cron-задачи. GitHub Actions не имеет такого ограничения и запускается каждые 10 минут бесплатно.

## БД: новая таблица

Drizzle-схема в `lib/db/schema.ts` (добавить экспортируемую таблицу):

```ts
export const notificationQueue = pgTable('notification_queue', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userName:     text('user_name').notNull(),
  userEmail:    text('user_email').notNull(),
  contacts:     text('contacts').notNull(),
  addedBooks:   text('added_books').notNull(), // JSON.stringify(string[]) — книги добавленные в этой записи, не весь selectedBooks
  isNew:        boolean('is_new').notNull(),
  createdAt:    timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  processingAt: timestamp('processing_at', { mode: 'date' }),  // NULL = свободна; NOT NULL = захвачена cron-ом
  sentAt:       timestamp('sent_at', { mode: 'date' }),         // NULL = не отправлено; NOT NULL = отправлено
}, (t) => ({
  sentAtIdx: index('notification_queue_sent_at_idx').on(t.sentAt),
}))
```

Импорты, уже используемые в schema.ts (`pgTable`, `text`, `boolean`, `timestamp`, `index`), добавлять не нужно.

Миграция: запустить `npx drizzle-kit generate` после изменения схемы — это создаст SQL-файл и обновит `drizzle/meta/_journal.json`. Не создавать SQL-файл вручную.

## Изменения в `/api/signup`

Убирается блок `resend.emails.send(...)`. Вместо него — INSERT в очередь, **только если `result.addedBooks.length > 0`** (то же условие, что сейчас у email-отправки).

INSERT выполняется fire-and-forget (не awaited) — осознанный трейдофф: добавляет ~0ms latency, но если INSERT упадёт (редкий сбой DB) — запись не попадёт в очередь и дайджест не придёт. Это приемлемо: организатор просто не получит уведомление за одну конкретную запись. Ошибка логируется через `.catch(console.error)`.

```ts
if (result.addedBooks.length > 0) {
  db.insert(notificationQueue).values({
    userName: name.trim(),
    userEmail: session.user.email,
    contacts: contacts.trim(),
    addedBooks: JSON.stringify(result.addedBooks),
    isNew: result.isNew,
  }).catch(console.error)
}
```

## Cron-эндпоинт `/api/cron/digest`

**Файл:** `app/api/cron/digest/route.ts`

**Авторизация:**
- Читать `process.env.CRON_SECRET`
- Если `CRON_SECRET` не задан в env — всегда возвращать 401 (misconfigured)
- Если заголовок `Authorization` отсутствует или не равен `Bearer <CRON_SECRET>` — возвращать 401

**Алгоритм (пронумерованные шаги):**

1. Авторизация → 401 при ошибке
2. Если `ADMIN_EMAIL` не задан → 200 `{ skipped: 'no-admin-email' }` (ранний выход до работы с БД)
3. Сброс зависших строк: `UPDATE notification_queue SET processing_at = NULL WHERE processing_at IS NOT NULL AND sent_at IS NULL AND processing_at < NOW() - INTERVAL '5 minutes'` — неатомарно, идемпотентно
4. Атомарный захват: одним SQL-запросом `UPDATE notification_queue SET processing_at = NOW() WHERE sent_at IS NULL AND processing_at IS NULL RETURNING *` — Postgres гарантирует row-level locking при UPDATE, конкурентные запуски получат непересекающиеся наборы строк
5. Если возвращённый набор пуст → 200 `{ skipped: 'empty' }`
6. Проверить дебаунс:
   - `latestCreatedAt = MAX(createdAt)` среди захваченных строк
   - `oldestCreatedAt = MIN(createdAt)` среди захваченных строк
   - «Всплеск не остыл» = `latestCreatedAt > NOW() - 30 minutes`
   - «Принудительный сброс» = `oldestCreatedAt < NOW() - 2 hours`
   - Если «всплеск не остыл» И принудительный таймаут не сработал → **освободить блокировку только для захваченных строк**: `WHERE id IN (capturedIds)` → 200 `{ skipped: 'cooling' }`
7. Сформировать письмо:
   - N = количество строк, M = суммарное число книг (сумма длин массивов `addedBooks`, без дедупликации)
   - **От:** `Долгое наступление <noreply@slowreading.club>`
   - **Кому:** `process.env.ADMIN_EMAIL`
   - **Тема:** `Дайджест записей: N участников, M книг`
   - **Тело (text):** краткая статистика + список: имя, контакт, email, книги; пометка «новая запись» / «обновление»; формат на усмотрение реализатора
8. Отправить через Resend
9. Если Resend бросил ошибку → **освободить блокировку только для захваченных строк**: `SET processing_at = NULL WHERE id IN (capturedIds)` → вернуть 500; строки остаются с `sent_at = NULL`, следующий cron-цикл повторит попытку
10. Обновить захваченные строки: `SET sent_at = NOW(), processing_at = NULL WHERE id IN (capturedIds)`

**Важно:** шаги 3 и 6 (сброс зависших строк) оперируют глобально — это намеренно. Шаги 6 (cooling), 9 и 10 оперируют только по `WHERE id IN (capturedIds)` — ID строк, возвращённых на шаге 4 — чтобы не затронуть строки, захваченные параллельным запуском.

## GitHub Actions Workflow

Новый файл `.github/workflows/digest.yml`:

```yaml
name: Notification Digest

on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch: # ручной запуск для тестирования

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - name: Call digest endpoint
        run: |
          curl -s -f -X GET https://www.slowreading.club/api/cron/digest \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -w "\nHTTP status: %{http_code}\n"
```

`vercel.json` присутствует в репозитории, но не содержит cron-конфигурации (`{}`).

## Env-переменные

| Переменная    | Где добавить                    | Назначение                                            |
|---------------|---------------------------------|-------------------------------------------------------|
| `CRON_SECRET` | Vercel Dashboard + GitHub Secrets + `.env.local` | Авторизация cron-запроса; если не задан в Vercel — всегда 401  |

`ADMIN_EMAIL` и `RESEND_API_KEY` уже существуют. CI (`ci.yml`) менять не нужно — в тестах `CRON_SECRET` задаётся локально.

## Тесты

### `app/api/cron/digest/route.test.ts`

Resend мокается через `jest.mock('resend')`.

`CRON_SECRET` задаётся **инлайн в тесте** через `process.env.CRON_SECRET = 'test-secret'` в `beforeEach` и удаляется в `afterEach` — не через `.env.local`, иначе тест упадёт в CI (в `ci.yml` нет этой переменной в `env:` блоке).

Сценарии:
- 401 при отсутствии заголовка `Authorization`
- 401 при неверном токене
- 401 если `CRON_SECRET` не задан в `process.env`
- 200 `{ skipped: 'no-admin-email' }` если `ADMIN_EMAIL` не задан
- 200 `{ skipped: 'empty' }` при пустой очереди
- 200 `{ skipped: 'cooling' }` если последняя строка моложе 30 минут; проверить что `processing_at` сброшен в NULL для захваченных строк
- 200 с вызовом Resend если очередь «остыла» (последняя строка старше 30 минут)
- 200 с вызовом Resend если старейшая строка старше 2 часов (принудительный сброс, даже если «всплеск не остыл»)
- 500 если Resend бросил ошибку; строки остаются с `sent_at = NULL` и `processing_at = NULL`
- Зависшие строки (processingAt старше 5 минут) сбрасываются в начале каждого цикла

### `app/api/signup/route.test.ts` (обновление)

Убрать мок Resend. Добавить мок DB-insert. Цепочка mock для fire-and-forget insert:

```ts
const mockInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockReturnValue({
    catch: jest.fn(),
  }),
})
```

Мок `@/lib/db` уже существует в тесте и содержит `db.delete`. Добавить `insert: mockInsert` в существующий объект мока.

Дополнительно: мок `@/lib/db/schema` уже содержит `{ bookPriorities: {} }`. Расширить его: добавить `notificationQueue: {}`, иначе импорт `notificationQueue` из схемы разрешится в `undefined`., сохранив `delete`-мок для тестов очистки приоритетов:

```ts
jest.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    delete: existingDeleteMock, // сохранить как есть
  },
}))
```

Проверить: `mockInsert` вызван при `addedBooks.length > 0`; не вызван при пустом `addedBooks`.

## Затронутые файлы

| Файл | Действие |
|------|----------|
| `lib/db/schema.ts` | Добавить таблицу `notificationQueue` |
| `drizzle/00XX_...sql` | Создать через `npx drizzle-kit generate` |
| `app/api/signup/route.ts` | Заменить `resend.emails.send` на INSERT в очередь |
| `app/api/signup/route.test.ts` | Убрать мок Resend, добавить мок DB-insert |
| `app/api/cron/digest/route.ts` | Новый cron-эндпоинт |
| `app/api/cron/digest/route.test.ts` | Тесты эндпоинта |
| `.github/workflows/digest.yml` | Новый workflow: запускает крон каждые 10 мин |
| `vercel.json` | Пустой `{}` — cron убран (Hobby-план не поддерживает) |

## Не входит в задачу

- Cleanup-задача для удаления старых отправленных строк (отложено)
- UI для просмотра очереди

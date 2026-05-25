# План работ — критические правки фазы 2

**Источник:** [audit-2026-05-phase2.md](audit-2026-05-phase2.md).
**Скоуп:** 4 пункта из топ-5 рисков повторного аудита (без Telegram rate-limit — это отдельная задача с подключением KV-сторейджа).

**Порядок исполнения:**
- **Этап 1 (быстрые правки, 5–6 часов суммарно):** три точечных фикса, низкий риск. Делаются в одном PR.
- **Этап 2 (день работы):** переключение БД-драйвера на WebSocket — инфраструктурное изменение, отдельный PR с регрессионным прогоном auth-флоу.

**Перед началом:**
- Все pre-commit чеки из `CLAUDE.md` обязательны: `npm run lint && npm run typecheck && npm test`.
- Перед каждой миграцией БД — прогнать проверочные SQL в Neon dashboard.
- E2E: нужен / не нужен — указывать в commit message каждого пункта.

---

## Этап 1. Быстрые точечные правки

### 1.1. GDPR-чистка `notification_queue` при удалении пользователя

**Проблема (источник: C1).** Таблица `notification_queue` хранит копии данных юзера (имя, email, список книг) без FK на `users`. Каждые 10 минут cron (`/api/cron/digest`) собирает pending-строки и шлёт админу один сводный email. Если юзер удалился между моментом постановки в очередь и моментом отправки — его данные всё равно уйдут админу. **GDPR-нарушение.**

В test-режиме чистка очереди при удалении тестового юзера уже сделана ([app/api/test/session/route.ts:85](../app/api/test/session/route.ts)) — то есть про проблему знают, но в проде аналогичная защита не добавлена.

**Файлы:**
- [app/api/admin/delete-user/route.ts:24](../app/api/admin/delete-user/route.ts) — админ удаляет другого юзера
- [app/api/user/route.ts:17](../app/api/user/route.ts) — юзер удаляет сам себя
- [lib/db/schema.ts:150-162](../lib/db/schema.ts) — определение таблицы

**Что сделать (два варианта).**

**Вариант A (быстрый, runtime cleanup).** В обоих роутах перед `db.delete(users)` добавить:
```ts
const targetUser = await db
  .select({ contactEmail: users.contactEmail })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1)

if (targetUser[0]?.contactEmail) {
  await db
    .delete(notificationQueue)
    .where(eq(notificationQueue.userEmail, targetUser[0].contactEmail))
}

await db.delete(users).where(eq(users.id, userId))
```

Импорт: `import { notificationQueue } from '@/lib/db/schema'`.

Усилия: XS.

**Вариант B (структурный, миграция).** Добавить колонку `user_id` в `notification_queue` с `FK ... ON DELETE CASCADE`. Тогда чистка идёт автоматически каскадом. Усилия: S.

Рекомендуется **вариант A** — закрывает риск немедленно, без миграции, без рисков. К варианту B можно вернуться позже, если понадобится структурная защита.

**Тесты:**
- Unit-тест на оба роута: создать юзера, поставить в `notification_queue`, удалить юзера, проверить что очередь пустая.
- E2E: **не нужен** (нет UI-флоу).
- Commit message: `fix(privacy): purge notification_queue on user deletion`.

---

### 1.2. Поправить `handleIdentitySyncError` — не ронять signIn на не-конфликтных ошибках

**Проблема (источник: C4).** В предыдущем аудите было найдено, что любая ошибка во вспомогательной функции `linkIdentityToUser` обрушивает весь signIn-flow. После прошлого аудита формально добавили try/catch вокруг вызовов в [lib/auth.ts:154-189](../lib/auth.ts), но внутри catch стоит вызов `handleIdentitySyncError(error)`, который **бросает ошибку дальше для всех типов** — в том числе для обычных DB-ошибок. То есть try/catch есть, но он ничего не ловит.

Identity-таблица — это вторичный кэш для отображения провайдеров в админке. Её недоступность не должна блокировать вход юзера.

**Файлы:**
- [lib/auth.ts:38-43](../lib/auth.ts) — текущая реализация `handleIdentitySyncError`

**Что сделать.** Изменить логику:
- Для `IdentityConflictError` (реальный конфликт — два разных юзера привязаны к одному identity) — `throw`, чтобы NextAuth показал error page и не пускал.
- Для всех остальных ошибок (БД упала, сетевая ошибка, race condition) — `console.error` без throw, чтобы signIn продолжился. Юзер войдёт, identity при следующем входе досинхронизируется.

```ts
function handleIdentitySyncError(error: unknown) {
  if (error instanceof IdentityConflictError) {
    // Реальный конфликт identity → блокируем вход.
    throw error
  }
  // Identity — вторичный кэш, не блокирующий auth-flow.
  console.error('Failed to sync user identity during sign-in', error)
}
```

Усилия: XS (5 строк).

**Тесты:**
- Unit-тест на signIn callback: замокать `linkIdentityToUser` так, чтобы бросал generic `Error('db down')` → проверить, что signIn возвращает true (не падает).
- Unit-тест: замокать так, чтобы бросал `IdentityConflictError` → проверить, что signIn падает.
- E2E: **не нужен**.
- Commit message: `fix(auth): do not abort signIn on non-conflict identity errors`.

---

### 1.3. Восстановить UNIQUE constraint на email

**Проблема (источник: H1).** До миграции `0019_drop_user_email.sql` в таблице `user` была колонка `email` с `NOT NULL UNIQUE` — структурная защита БД от дубликатов юзеров с одинаковым email. После миграции колонка переименована в `contact_email`, стала nullable, и **уникальный индекс не восстановлен**. Сейчас структурно возможны два юзера с одинаковым email.

Случаи, когда это сработает:
- Гонка двух параллельных вкладок при первом OAuth-входе.
- Любой будущий код, который вставит/обновит `contact_email` без нормализации (например, через админку или ручную миграцию).

Драйвер БД сейчас не поддерживает транзакции (см. этап 2), что усиливает риск гонки.

**Файлы:**
- [lib/db/schema.ts:5-17](../lib/db/schema.ts) — определение users
- Новая миграция `drizzle/0028_unique_contact_email.sql`
- Опционально: проверить все места записи `contact_email` на использование `normalizeEmail` из [lib/user-identities.ts:82-91](../lib/user-identities.ts)

**Что сделать.**

**Шаг 1.** Предмиграционная проверка через Neon SQL editor:
```sql
-- Проверка 1: есть ли уже накопившиеся дубликаты по lower(email)?
SELECT
  lower(contact_email) AS email_lower,
  count(*) AS dupes,
  array_agg(id) AS user_ids
FROM "user"
WHERE contact_email IS NOT NULL
GROUP BY lower(contact_email)
HAVING count(*) > 1;

-- Проверка 2: есть ли записи с несовпадающим case?
SELECT id, contact_email
FROM "user"
WHERE contact_email IS NOT NULL
  AND contact_email != lower(contact_email);
```

- Если проверка 1 даёт строки — решить вручную (слить юзеров или добавить суффикс к email одного из них). Обсудить с владельцем продукта.
- Если проверка 2 даёт строки — это безопасно, backfill ниже их исправит.

**Шаг 2.** Миграция `drizzle/0028_unique_contact_email.sql`:
```sql
-- Нормализуем существующие записи к нижнему регистру
UPDATE "user"
SET contact_email = lower(contact_email)
WHERE contact_email IS NOT NULL
  AND contact_email != lower(contact_email);

-- Уникальный индекс по lower(email), допускает NULL для Telegram-юзеров
CREATE UNIQUE INDEX user_contact_email_lower_idx
  ON "user" (lower(contact_email))
  WHERE contact_email IS NOT NULL;
```

Особенности этого индекса:
- `lower(contact_email)` — `Alice@gmail.com` и `alice@gmail.com` считаются одинаковыми.
- `WHERE contact_email IS NOT NULL` — Telegram-юзеры без email не конфликтуют.

**Шаг 3.** Аналогично для `user_identities.email` (защита для email-провайдера identity):
```sql
UPDATE user_identities
SET email = lower(email)
WHERE email IS NOT NULL
  AND email != lower(email);

CREATE INDEX user_identities_email_lower_idx
  ON user_identities (lower(email))
  WHERE email IS NOT NULL;
```
(Здесь не UNIQUE — у одного email может быть несколько identity у разных юзеров через разные провайдеры; индекс нужен только для поиска.)

**Шаг 4.** Code review всех мест записи `contact_email`:
- Проверить, что `IdentityAwareDrizzleAdapter.createUser` ([lib/auth-adapter.ts:55-67](../lib/auth-adapter.ts)) приводит email к lowercase через `normalizeEmail`.
- Проверить `/api/profile`, `/api/me`, и админские роуты обновления юзера — везде ли нормализация.
- Если где-то нет — добавить.

Усилия: S (миграция + ревизия записи + тесты).

**Тесты:**
- Unit-тест на adapter: `createUser({email: 'Alice@Gmail.com'})` → второй вызов `createUser({email: 'alice@gmail.com'})` бросает constraint error.
- Unit-тест: `getUserByEmail('Alice@Gmail.com')` находит юзера, у которого в БД `alice@gmail.com`.
- E2E: **не нужен** (нет нового UI-флоу).
- Commit message: `fix(db): restore unique email constraint via lower(contact_email) index`.

---

## Этап 2. Переключение на драйвер с поддержкой транзакций

### 2.1. Миграция `drizzle-orm/neon-http` → `drizzle-orm/neon-serverless`

**Проблема (источник: C2).** Текущий драйвер БД `@neondatabase/serverless` в режиме HTTP (`drizzle-orm/neon-http`) не поддерживает транзакции — это известное ограничение драйвера, оптимизированного под serverless. В коде есть обёртка `withIdentityTransaction` ([lib/user-identities.ts:55-67](../lib/user-identities.ts)), которая **пытается** открыть транзакцию, ловит специфическую ошибку драйвера и **молча продолжает без atomicity**. То есть кажется что транзакция есть, а её нет.

Это создаёт класс багов: мульти-таблица операции (`resolveOrCreateUserFromIdentity`, `upsertSignup`, digest cron claim-send-mark) могут частично выполниться при сбое. После 1.3 (UNIQUE на email) защита от части последствий появится, но atomicity по-прежнему отсутствует.

Решение — переключиться на тот же `@neondatabase/serverless`, но в WebSocket-режиме (`drizzle-orm/neon-serverless`). Транзакции поддерживаются, тариф Neon Free допускает (это клиентская опция, не тарифная фича).

**Файлы:**
- [lib/db/index.ts:1-7](../lib/db/index.ts) — конфигурация подключения
- [lib/user-identities.ts:55-67](../lib/user-identities.ts) — текстовый fallback при отсутствии транзакций (удалить после миграции)
- `package.json` — возможно потребуется зависимость `ws` (для Node-окружения WebSocket'у нужен polyfill)

**Что сделать.**

**Шаг 1.** Изменить `lib/db/index.ts`:

Текущий код (примерно):
```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

Новый код:
```ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

// В Node.js (включая serverless functions Vercel) для WebSocket нужен polyfill.
// В Edge runtime WebSocket нативен — polyfill можно условно отключить.
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
export const db = drizzle(pool, { schema })
```

Установить `ws`:
```bash
npm install ws
npm install -D @types/ws
```

**Шаг 2.** Удалить fallback в [lib/user-identities.ts:55-67](../lib/user-identities.ts) — теперь транзакции работают:

```ts
async function withIdentityTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(callback)
}
```

(Простыми словами — убрать весь `try/catch` с проверкой текста ошибки, оставить только нормальный вызов.)

**Шаг 3.** Найти все места в коде, где можно теперь использовать настоящие транзакции, и обновить:
- `resolveOrCreateUserFromIdentity` — обернуть в `db.transaction`.
- `upsertSignup` в [lib/signup-books.ts](../lib/signup-books.ts) — заменить `sql.transaction([...])` batched-pattern на обычную `db.transaction(tx => ...)`.
- `/api/cron/digest` claim-send-mark — обернуть в транзакцию (закрывает потенциальный H4 — дубль уведомлений при сбое).
- `/api/admin/remove-book`, `/api/admin/signup-books` — атомарный delete + re-rank.

Каждое из этих изменений — отдельный коммит в рамках того же PR, чтобы код-ревью был чётким.

**Шаг 4.** Регрессионный прогон:
- `npm run lint && npm run typecheck && npm test`
- E2E full suite: `npm run playwright test`
- Локальный smoke: вход через все четыре провайдера (Google OAuth, Google One Tap, Email magic link, Telegram).
- Проверить cold-start latency деплоя на Vercel (preview deployment) — WebSocket-handshake добавляет немного, обычно незаметно на Fluid Compute.

Усилия: M (1 рабочий день с тестами).

**Риски и митигация:**

1. **Cold-start latency.** WebSocket требует handshake при каждом cold-start. На Vercel Fluid Compute инстансы переиспользуются — заметно только на первом запросе после длительной паузы. Митигация: измерить на preview deployment, сравнить с базовым.
2. **Connection limits Neon Free tier (~100 одновременных).** HTTP-driver не "съедает" слот, WebSocket — съедает на время функции. На текущем трафике до лимита не дойдёт. Митигация: подключить Neon Pooler endpoint (бесплатно), если когда-нибудь упрёмся.
3. **Compute hours Neon Free (~190 ч/месяц).** WebSocket чуть дольше держит compute активным. Минимально на текущем масштабе. Митигация: отслеживать через Neon dashboard первую неделю после деплоя.
4. **Edge runtime несовместим с `ws` polyfill.** Если какой-то route компилируется под Edge, у него будет ошибка импорта `ws`. Митигация: условный импорт через `typeof WebSocket === 'undefined'` (см. код выше); проверить, что все наши API-роуты на Node.js runtime (по умолчанию так).
5. **Откат.** Если что-то пойдёт не так — `lib/db/index.ts` откатывается одним коммитом, обёртка `withIdentityTransaction` тоже. Низкий риск.

**Тесты:**
- E2E full suite (auth, signup, priorities, submissions, admin).
- Unit-тест на новую `withIdentityTransaction`: успешный commit, rollback при ошибке.
- Smoke на preview deployment — все 4 auth-флоу.
- Commit message PR: `feat(db): switch to neon-serverless driver to enable transactions`.

---

## Финальный чек-лист

### Этап 1 (один PR, 5–6 часов)
- [x] 1.1. Чистка `notification_queue` при `delete-user` и `/api/user` — XS
- [x] 1.2. Поправить `handleIdentitySyncError` — XS
- [x] 1.3. UNIQUE index `lower(contact_email)` + backfill + ревизия записи — S

### Этап 2 (отдельный PR, ~1 день)
- [x] 2.1. Переключение на `drizzle-orm/neon-serverless` + удаление fallback'а + использование транзакций в hot-paths — M

### После завершения
- [x] Обновить статус пунктов в [audit-2026-05-phase2.md](audit-2026-05-phase2.md): C1, C2, C4, H1 → ✅.
- [ ] Рассмотреть следующие пункты из плана: Telegram rate-limit (C3), объединение `signup_books`+`book_priorities` (H2), индексы по `book_id` (M2).

---

## Чего НЕ делать в рамках этого плана

- **Telegram rate-limit (C3 из аудита)** — отдельная задача с подключением Upstash/Vercel KV. Не входит в этот план.
- **Объединение `signup_books` + `book_priorities` (H2)** — структурный рефакторинг, разблокирован транзакциями (этап 2), но требует отдельной миграции данных. Делать после.
- **`text → jsonb` для metadata-полей** — низкий приоритет, не блокирует ничего.
- **Возвращать `account`/`session` таблицы** — кастомный adapter работает корректно.

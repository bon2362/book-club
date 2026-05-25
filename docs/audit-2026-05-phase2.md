# Технический аудит Book Club — фаза 2 (май 2026, повторный)

**Скоуп:** актуальная структура БД, auth-цепочка, карта фич. Аудит сделан после реализации значительной части плана из [audit-plan-phase1.md](audit-plan-phase1.md).
**Стек:** Next.js 14 + NextAuth v5 + Neon Postgres (WebSocket driver) + Drizzle ORM + Resend + Vercel. **Google Sheets больше не используется** — каталог книг переехал в Postgres.
**Состояние:** 12 таблиц (было 16), 29 миграций (0000–0028, добавлено 15 с прошлого аудита), кастомный `IdentityAwareDrizzleAdapter`.

---

## Executive Summary

**Хорошие новости.** Большая часть архитектурного долга, найденного в [фазе 1](audit-2026-05.md), закрыта. В частности:
- Identity-модель сведена к одной таблице `user_identities`: `account` и `session` дропнуты миграцией `0025` с защитным `RAISE EXCEPTION`-guard'ом.
- Денормализованные поля `users.{authProvider, telegramUsername, lastSignInAt, email}` удалены (миграции `0019`, `0020`).
- Custom `IdentityAwareDrizzleAdapter` пишет только в `users` + `user_identities`.
- **Google Sheets полностью выведен из runtime** — каталог книг в таблице `books` (миграции `0021–0027`). FK CASCADE на `signup_books`/`book_priorities`/`book_submissions` через `book_id`.
- `intro_sections` runtime `CREATE TABLE` убран (`lib/intro.ts:50-52`), seed перенесён в миграцию `0016`.
- `priorities_set` сбрасывается при пустом signup (`app/api/signup/route.ts:30-34`).

**Обновление после critical-плана.** C1, C2, C4 и H1 закрыты: production delete-route чистят `notification_queue`, DB-драйвер переключён на `neon-serverless` с настоящими транзакциями, non-conflict identity sync errors больше не блокируют signIn, а `contact_email` защищён unique index по `lower(contact_email)`.

**Топ-5 рисков сейчас:**

1. **C3 (повтор) — `/api/auth/telegram/callback` без rate-limit + cleanup раз в сутки.** Без изменений. `Critical`, M.
2. **H2 (новый, NEW-H2) — двойная запись `user_identities` при OAuth Google.** Adapter `linkAccount` вставляет identity → signIn callback `linkIdentityToUser` делает второй UPSERT. `High`, XS.
3. **M2 — PK `(user_id, book_id)` не покрывает обратный поиск по `book_id`.** При CASCADE удаления книги Postgres делает full scan на `signup_books` и `book_priorities`. `Medium`, XS.
4. **M3 — избыточный `ts` в Telegram auth URL.** TTL уже задаётся pre-auth токеном в БД. `Medium`, XS.
5. **M4 — partial index на `notification_queue` для pending/processing выборок.** Сейчас есть только `sent_at`. `Medium`, XS.

И ещё одна положительная новость: **объединение `signup_books` + `book_priorities` (H7 из фазы 1) теперь почти тривиально** — после миграций PK обеих таблиц совпадает `(user_id, book_id)`. Стоимость снизилась с S до XS-S.

---

## 1. Что изменилось с прошлого аудита

### Реализовано из плана фазы 1

| План | Статус | Где |
|---|---|---|
| Шаг 1.5 **M1 / `DROP TABLE session`** | ✅ | `0025_drop_legacy_auth_tables.sql` |
| Шаг 2.1 **H4 / `users.lastSignInAt`** | ✅ | `0020_drop_user_auth_cache.sql` |
| Шаг 2.2 **H3 / `users.telegramUsername`** | ✅ | `0020` (мигрировал в `users.contacts` + `user_identities.telegramUsername`) |
| Шаг 2.3 **H2 / `users.authProvider`** | ✅ | `0020` (админка теперь делает `MAX(lastSeenAt)` агрегацию по identities, [lib/admin-users.ts:122-128](lib/admin-users.ts)) |
| Шаг 3.1 **H1 / backfill `accounts → user_identities`** | ✅ | `0014_google_accounts_user_identities_backfill.sql` + кастомный `IdentityAwareDrizzleAdapter` ([lib/auth-adapter.ts](lib/auth-adapter.ts)) |
| Шаг 4.2 **M3 / intro runtime CREATE TABLE** | ✅ | `lib/intro.ts:50-52` (теперь `return Promise.resolve()`), seed в `0016_seed_intro_sections.sql` |
| Шаг 1.3 **M7 / `priorities_set` сброс** | ✅ | `app/api/signup/route.ts:30-34` |
| Бонус — миграция каталога книг (не было в плане) | ✅ | `0021_books_catalog.sql` → `0027_books_catalog_cleanup.sql`. Sheets как runtime-источник полностью устранён |
| `users.email` → `users.contactEmail` (не было в плане) | ✅ | `0018` + `0019` |

### НЕ реализовано из плана фазы 1

| План | Статус | Комментарий |
|---|---|---|
| Шаг 1.1 **C4 / try/catch вокруг `linkIdentityToUser`** | ✅ | `handleIdentitySyncError` пробрасывает только `IdentityConflictError`; прочие ошибки identity-cache логируются без срыва signIn ([lib/auth.ts](lib/auth.ts)) |
| Шаг 1.2 **L4 / legacy `telegram` provider** | ❓ не проверено | Нужно `grep "id: 'telegram'"` в `lib/auth.ts` |
| Шаг 1.4 **L3 / `/api/books`** | ❓ не проверено | Эндпоинт жив, фактически — это fallback каталога |
| Шаг 4.1 **H7 / объединить signup_books + book_priorities** | ❌ | Не сделано. **Стало проще:** PK обеих таблиц теперь `(user_id, book_id)`. См. H2 ниже. |
| Шаг 4.3 **M5 / lowercase email + unique index** | ✅ | Нормализация на запись + `0028_unique_contact_email.sql` с unique index `lower(contact_email)` |
| Шаг 4.4 **M2 / text → jsonb** | ⚠️ частично | Сделано только для `books.tags`. Остальное (`user_identities.metadata`, `user_activity_events.metadata`, `notification_queue.added_books`, `users.languages`) — всё ещё `text`. |
| Шаг 5.1 **H6 / unit-test на magic link** | ❌ | Не сделано |

### Не из плана — оставались "за скобками" фазы 1

| Пункт | Статус |
|---|---|
| **C1 — `notification_queue` GDPR cleanup** | ✅ production routes чистят очередь перед delete |
| **C2 — driver на neon-serverless** | ✅ `lib/db/index.ts` использует `drizzle-orm/neon-serverless` + `Pool` |
| **C3 — Telegram rate-limit** | ❌. См. C3. |
| **H5 — судьба `user_activity_events`** | ⚠️ де-факто принят вариант (b) "оставить", но без комментария в коде |
| **M6 — `VERCEL_ENV` hard-check** | ❌ |
| **M9 — `force-dynamic` на auth handlers** | ❌ |

### Новые проблемы (появились после рефакторингов)

1. **H1 — потерян UNIQUE на email.** ✅ Закрыто миграцией `0028_unique_contact_email.sql`.
2. **H2 (новый, NEW-H2) — двойная запись `user_identities` при OAuth Google.** Adapter `linkAccount` вставляет identity → signIn callback `linkIdentityToUser` делает второй UPSERT с другим `metadata.source`. ON CONFLICT защищает от ошибки, но лишний round-trip + перетёрты метаданные adapter'а.
3. **M2 — PK `(user_id, book_id)` не покрывает обратный поиск по `book_id`.** При CASCADE удаления книги Postgres делает full scan на `signup_books` и `book_priorities`. На малых объёмах ОК, при росте — заметно.

---

## 2. Карта фич (актуальная)

| Фича | Где живёт | API | Источник данных | Куда пишет |
|---|---|---|---|---|
| Каталог книг | `app/page.tsx`, `BooksPage.tsx`, `BookRow.tsx`, `BookCard.tsx` | server-side `fetchBooksWithCovers`; fallback `GET /api/books` | `books` (фильтр `visibility='published'`, sort `sortOrder`/`publishedAt`) | — |
| Обложки | `CoverImage.tsx` | — | `books.coverUrl` (с fallback на инициалы) | — |
| Описания/раскрытие | `BookCard.tsx` (>120 симв.) | — | `books.description` | — |
| Фильтры/теги | `BooksPage.tsx`, `lib/search.ts` | — | `books.tags` (jsonb), `tag_descriptions` | — |
| Google OAuth | `AuthModal.tsx` | `/api/auth/[...nextauth]` | NextAuth Google + IdentityAwareDrizzleAdapter | `users`, `user_identities`, `user_activity_events` |
| Google One Tap | `GoogleOneTap.tsx` | Credentials `google-one-tap` | ID-token verify | `users`, `user_identities`, `user_activity_events` |
| Email magic link | `AuthModal.tsx` (Resend) | NextAuth Resend | Resend | `users`, `verificationToken`, `user_identities` |
| Telegram login | `AuthModal.tsx` → `/api/auth/telegram/callback` → `/auth/telegram` → `signIn('telegram-preauth')` | HMAC + pre-auth token | Telegram widget | `users`, `telegram_preauth_tokens`, `user_identities`, `user_activity_events` |
| Профиль (drawer + ContactsForm) | `ProfileDrawer.tsx`, `ContactsForm.tsx` | `/api/profile`, `/api/me`, `DELETE /api/user` | `users.{name,contactEmail,contacts,languages,prioritiesSet}`, `user_identities` | те же + `user_activity_events`; DELETE каскадно чистит почти всё |
| "Хочу читать" / запись | `BooksPage.tsx`, `BookCard.tsx` | `POST /api/signup` | `signup_books`, `books`, `users` | `signup_books`, `users.{name,contacts,prioritiesSet}`, `book_priorities` (cleanup), `notification_queue`, `user_activity_events` |
| Приоритеты | `ProfileDrawer.tsx` (@dnd-kit) | `GET/PUT /api/priorities` | `book_priorities` + `books` | `book_priorities`, `users.prioritiesSet` |
| Предложить книгу | `SubmitBookForm.tsx`, `SubmitBookButton.tsx`, `SubmitBookCard.tsx` | `/api/submissions[/id]` | `book_submissions` | `book_submissions`, `user_activity_events` |
| Feedback | `FeedbackForm.tsx` | `POST /api/feedback` | — | `feedback` + email админу |
| Intro/About | `AboutBlock.tsx`, server-side `getIntroData` | `GET /api/intro` | `intro_sections` | — |
| Notifications digest | — (cron) | `GET /api/cron/digest` | `notification_queue` | claim → email админу → `sent_at` |
| Admin: участники | `app/admin/page.tsx`, `AdminUserDrawer.tsx` | `/api/admin/users`, `/api/admin/users/[id]` | `users` + агрегаты + `user_identities` | — |
| Admin: каталог | `AdminBooksCatalog.tsx` | `/api/admin/books[/id]`, `/reorder` | `books` | `books` |
| Admin: записи на книги | `AdminPanel.tsx` | `/api/admin/remove-book`, `/api/admin/signup-books` | `signup_books`, `book_priorities` | те же (с ручным re-rank) |
| Admin: модерация заявок | `AdminPanel.tsx` | `/api/admin/submissions[/id]` | `book_submissions`; approve → создаёт `books` через `lib/book-publish.ts` | те же + `books` |
| Admin: intro editor | `IntroEditor.tsx` | `/api/admin/intro[/id]` | `intro_sections` + `revalidateTag` | `intro_sections` |
| Admin: digest status | `DigestStatusWidget.tsx` | `/api/admin/digest-status` | `notification_queue` count | — |
| Admin: PostHog usage | `PostHogUsageWidget.tsx` | `/api/admin/posthog-usage` | внешний PostHog API | — |
| Admin: status | `AdminStatusBar.tsx` | `/api/admin/status` | внешние GitHub/Vercel API | — |

### Cron jobs

| Задача | Расписание | Запуск | Что делает | Таблицы |
|---|---|---|---|---|
| Notification digest | `*/10 * * * *` | GitHub Actions → `/api/cron/digest` с `Bearer CRON_SECRET` | claim + send + mark sent. Reclaim stale locks >5 мин, дебаунс 30 мин/2 ч. | `notification_queue` |
| Telegram preauth cleanup | `0 3 * * *` | Vercel cron → `/api/cron/telegram-preauth-cleanup` | DELETE expired tokens | `telegram_preauth_tokens` |

### Граница Sheets ↔ БД

**Sheets в runtime не используется.** Единственное упоминание — enum-значение `'google_sheets'` в `lib/user-activity.ts:21` для исторических `sheets_import`-событий backfill. Скрипт `scripts/migrate-signups.ts` — legacy. Каталог, обложки, signups, priorities, submissions, feedback, intro, queue — всё в Postgres.

---

## 3. Инвентаризация БД (актуальная, 12 таблиц)

| Таблица | Ключи / Индексы | FK | Активность |
|---|---|---|---|
| `user` | PK `id`; **нет UNIQUE на contact_email** | — | hot R/W везде |
| `user_identities` | PK `id`; UNIQUE `(provider, providerAccountId)`; IDX `user_id` | `userId → user CASCADE` | adapter + `lib/user-identities.ts` |
| `user_activity_events` | PK `id`; IDX `(user_id, occurred_at)`; UNIQUE `dedupe_key` | `userId → user CASCADE` | **только W** (читателей нет); writer обновляет `users.lastActivityAt` |
| `verificationToken` | PK `(identifier, token)` | — | NextAuth Resend |
| `books` | PK `id`; IDX `visibility`, `sort_order`; CHECK на enum-полях | — | hot R; W из admin и `book-publish.ts` |
| `tag_descriptions` | PK `tag` | — | admin write, page read |
| `book_submissions` | PK `id`; IDX `status`, `book_id` | `userId → user CASCADE`; `bookId → books SET NULL` | user submit + admin moderation |
| `book_priorities` | PK `(user_id, book_id)` | `userId → user CASCADE`; `bookId → books CASCADE` | drag, admin |
| `signup_books` | PK `(user_id, book_id)` | `userId → user CASCADE`; `bookId → books CASCADE` | signup, admin |
| `feedback` | PK `id` | `userId → user SET NULL` | feedback form |
| `intro_sections` | PK `id`; IDX `(kind, sort_order)` | — | admin intro editor |
| `notification_queue` | PK `id`; IDX `sent_at` | **нет FK на user** ⚠️ | signup write, digest cron |
| `telegram_preauth_tokens` | PK `token_hash`; IDX `user_id`, `expires_at` | `userId → user CASCADE` | telegram callback, cron cleanup |

---

## 4. Граф auth-модели (актуальный)

```
                       ┌──────────────────────────────┐
                       │  user (PK: id)               │
                       │  contact_email (nullable,    │
                       │    БЕЗ UNIQUE — см. H1)      │
                       │  name, image, contacts       │
                       │  last_activity_at  (кэш)     │
                       │  priorities_set, is_admin    │
                       │  languages                   │
                       └──┬───────────────────────────┘
                          │ id
       ┌──────────────────┼──────────────────────┐
       ▼                  ▼                      ▼
┌────────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│  user_identities   │  │ telegram_       │  │ user_activity_       │
│  PK id             │  │ preauth_tokens  │  │ events               │
│  UNIQUE (prov,     │  │ PK token_hash   │  │ PK id; UNIQUE        │
│   provAccId)       │  │ FK user CASCADE │  │  dedupe_key          │
│  email, telegram_  │  │                 │  │ FK user CASCADE      │
│    username,       │  │ ← telegram      │  │                      │
│  metadata (text)   │  │   callback      │  │ WRITE-ONLY           │
│  FK user CASCADE   │  │                 │  │ (нет читателей,      │
│                    │  │                 │  │  поддерживает        │
│  source-of-truth   │  │                 │  │  users.last_         │
│  для провайдеров   │  │                 │  │  activity_at)        │
└────────────────────┘  └─────────────────┘  └──────────────────────┘
```

**Что устранено с фазы 1:**
- `accounts` + дублирование с `user_identities` → дропнут (0025).
- `users.{telegramUsername, authProvider, lastSignInAt}` → дропнуты (0020).
- `session` (dead при JWT) → дропнут (0025).
- Дублирование Sheets vs БД для каталога → устранено (миграции 0021–0027).

**Что осталось:**
- `users.contact_email` без UNIQUE (структурный регресс — см. H1).
- `users.last_activity_at` — кэш, поддерживается writer'ом `user_activity_events`. Без таблицы events упадёт сортировка админки.
- `user_identities.telegram_username` дублирует `users.contacts` для Telegram-юзеров (одно из двух обновляется условно — рассинхрон возможен, но не наблюдается).
- **Двойная запись identity** при OAuth Google (adapter `linkAccount` + signIn callback `linkIdentityToUser`) — NEW-H2.

### Resolve identity по сценариям

**1. Первый Google OAuth.** Adapter создаёт `users` + `user_identities`. signIn callback ещё раз UPSERT'ит identity (двойная запись — см. NEW-H2). Создаётся activity-event.

**2. Тот же юзер через Email magic link.** Adapter находит существующего по `getUserByEmail(contactEmail)`. signIn callback линкует email-identity → **2 строки** в `user_identities` (google + email). Дублей в `users` нет.

**3. Тот же человек через Telegram.** `canLinkByEmail` для telegram = `false` (`lib/user-identities.ts:106-111`). Создаётся **новый user без email** — это архитектурное ограничение Telegram Login Widget (нет email в данных от Telegram).

**Account-takeover surface:** для Google `canLinkByEmail` проверяет `profile.emailVerified !== false` — защищено. Email-провайдер сам по себе доказывает владение почтой. Telegram не отдаёт email — линк по email невозможен.

---

## 5. Находки

### Critical

#### C1 (повтор). `notification_queue` GDPR-leak при `DELETE FROM user`
**Статус:** ✅ закрыто в critical-плане — `/api/admin/delete-user` и `/api/user` удаляют pending rows из `notification_queue` по `contact_email` перед удалением пользователя.
**Где:** [app/api/admin/delete-user/route.ts:24](app/api/admin/delete-user/route.ts), [app/api/user/route.ts:17](app/api/user/route.ts), [lib/db/schema.ts:150-162](lib/db/schema.ts)
**Что:** Без изменений с фазы 1. `notification_queue` не имеет FK на user, не чистится при delete. Через 10 минут cron шлёт админу email удалённого юзера.
**Почему критично:** GDPR-нарушение. В test-режиме чистка есть ([app/api/test/session/route.ts:85](app/api/test/session/route.ts)) — то есть про проблему знают, но в проде не починили.
**Предложение:** либо одна строчка `await db.delete(notificationQueue).where(eq(notificationQueue.userEmail, contactEmail))` перед `delete users` в обоих роутах, либо миграция с `user_id` FK CASCADE (структурное решение).
**Усилия:** XS (runtime) / S (миграция + backfill).

#### C2 (повтор). Driver всё ещё `neon-http`, транзакции "молча фолбэчатся"
**Статус:** ✅ закрыто в critical-плане — `lib/db/index.ts` переключён на `drizzle-orm/neon-serverless`, fallback в `withIdentityTransaction` удалён, hot-path multi-step writes переведены на `db.transaction`.
**Где:** [lib/db/index.ts:1-7](lib/db/index.ts), [lib/user-identities.ts:55-67](lib/user-identities.ts)
**Что:** Появилась обёртка `withIdentityTransaction`, которая **пытается** `client.transaction(callback)` и при ошибке текстом `"No transactions support in neon-http driver"` молча продолжает без atomicity. Это **молчаливая деградация**: класс багов остался, плюс fragile text-match по error message — при изменении сообщения в новой версии библиотеки поведение тихо изменится.
**Class of bugs:** `resolveOrCreateUserFromIdentity` делает 3 шага (INSERT users → UPSERT identity → activity event). Без транзакций частичный сбой → orphan-user без identity. UNIQUE на `(provider, providerAccountId)` поймает повторную попытку, но без UNIQUE на `contact_email` (см. H1) — дубль user возможен.
**Предложение:** переключить `lib/db/index.ts` с `drizzle-orm/neon-http` на `drizzle-orm/neon-serverless` (WebSocket pool). Однострочное изменение, требует регрессионного теста auth-флоу + проверки cold-start latency.
**Усилия:** M.

#### C3 (повтор). `/api/auth/telegram/callback` без rate-limit, cleanup раз в сутки
**Где:** [app/api/auth/telegram/callback/route.ts](app/api/auth/telegram/callback/route.ts), [lib/telegram-auth.ts:36-43,61-65](lib/telegram-auth.ts), [vercel.json](vercel.json)
**Что:** Без изменений. Атакующий с валидной HMAC-подписью в течение 5-минутного окна может заспамить эндпоинт. `cleanupTelegramPreauthTokens` без LIMIT — на большой очереди убьёт БД на минуты.
**Предложение:**
- Rate-limit (IP+telegram_id) 10/мин — Upstash/Vercel KV.
- При INSERT нового токена удалять прошлые токены того же user (one-active-token-per-user) — устраняет flooding по строкам.
- Cron — каждый час с `LIMIT 10000` в цикле.
- Бонус: убрать параметр `ts` из URL `/auth/telegram?ts=...` (см. M3 ниже) — токен сам TTL-bound в БД.
**Усилия:** M.

#### C4 (новый). `IdentityConflictError` всё ещё обрушивает signIn-flow
**Статус:** ✅ закрыто в critical-плане — `handleIdentitySyncError` пробрасывает только `IdentityConflictError`, остальные ошибки логирует без блокировки входа.
**Где:** [lib/auth.ts:38-43,154-189](lib/auth.ts)
**Что:** Старый C4 формально "починен" — обёртка `try/catch` появилась. Но в catch — `handleIdentitySyncError(error)`, который для `IdentityConflictError` `throw error`, а для остальных — `console.error` + `throw error`. Поведение **не изменилось**: любая ошибка identity-helper'а ломает signIn.
**Risk:** Identity-конфликт после миграции/race → юзер заблокирован до ручной чистки `user_identities`. Identity — вторичный кэш, не должен блокировать вход.
**Предложение:**
```ts
function handleIdentitySyncError(error: unknown) {
  if (error instanceof IdentityConflictError) {
    // конфликт реальный — пробросить, чтобы NextAuth показал error page
    throw error
  }
  // всё остальное — кэш, не блокирующий
  console.error('Failed to sync user identity during sign-in', error)
}
```
**Усилия:** XS.

---

### High

#### H1 (новый). UNIQUE на `users.contact_email` потерян после миграции 0019
**Статус:** ✅ закрыто в critical-плане — `0028_unique_contact_email.sql` нормализует текущие значения и добавляет `user_contact_email_lower_idx`; `user_identities.email` получил lower-case backfill и поисковый index.
**Где:** [lib/db/schema.ts:5-17](lib/db/schema.ts), [lib/auth-adapter.ts:55-67](lib/auth-adapter.ts)
**Что:** До 0019 `users.email` был `NOT NULL UNIQUE` — структурная защита от дублей. После миграции `contact_email` стал nullable без UNIQUE. `IdentityAwareDrizzleAdapter.createUser` полагается только на upstream `getUserByEmail` adapter call — в гонке двух параллельных вкладок оба пройдут проверку и создадут двух юзеров с одним email.
**Также:** сравнение `eq(users.contactEmail, email)` case-sensitive. Adapter нормализует на запись, но любой код, пишущий напрямую (миграция, админский ручной update) может создать row, который не найдётся обратным поиском.
**Предложение:** миграция
```sql
-- 1. Проверочный SQL: есть ли уже дубли?
SELECT lower(contact_email), count(*), array_agg(id)
FROM "user"
WHERE contact_email IS NOT NULL
GROUP BY lower(contact_email)
HAVING count(*) > 1;

-- 2. Если пусто — добавляем индекс
CREATE UNIQUE INDEX user_contact_email_lower_idx
  ON "user" (lower(contact_email))
  WHERE contact_email IS NOT NULL;

-- 3. Backfill: UPDATE users SET contact_email = lower(contact_email)
UPDATE "user" SET contact_email = lower(contact_email) WHERE contact_email != lower(contact_email);
```
То же стоит сделать для `user_identities.email`.
**Усилия:** S.

#### H2 (повтор, H7 из фазы 1). Объединить `signup_books` + `book_priorities`
**Где:** [lib/db/schema.ts:112-127](lib/db/schema.ts), [app/api/signup/route.ts:38-53](app/api/signup/route.ts), [app/api/admin/remove-book/route.ts](app/api/admin/remove-book/route.ts), [app/api/admin/signup-books/route.ts](app/api/admin/signup-books/route.ts)
**Что:** Не сделано из фазы 1. **Хорошая новость:** после миграций PK обеих таблиц теперь идентичен — `(user_id, book_id)` с FK CASCADE на `users` и `books`. Миграция тривиальна:
```sql
ALTER TABLE signup_books
  ADD COLUMN rank int NULL,
  ADD COLUMN rank_updated_at timestamp NULL;

UPDATE signup_books sb
SET rank = bp.rank, rank_updated_at = bp.updated_at
FROM book_priorities bp
WHERE sb.user_id = bp.user_id AND sb.book_id = bp.book_id;

DROP TABLE book_priorities;
```
**Эффекты:** убираем ручную чистку приоритетов в `app/api/signup/route.ts:38-53`, объединяем re-rank-логику в `/api/admin/remove-book` и `/api/admin/signup-books`, один SELECT в админке.
**Усилия:** S (было S в фазе 1, осталось S — но проще на уровне миграции).

#### H3 (новый). Двойная запись `user_identities` при OAuth Google
**Где:** [lib/auth-adapter.ts:104-126](lib/auth-adapter.ts) (linkAccount) + [lib/auth.ts:153-165](lib/auth.ts) (signIn callback)
**Что:** При Google OAuth NextAuth сначала вызывает adapter `linkAccount` → INSERT в `user_identities` с `metadata={source:'auth-adapter-link-account'}`. Сразу после signIn callback вызывает `linkIdentityToUser` → UPSERT с `metadata={source:'auth-sign-in'}` (перетирает metadata от adapter, потерян тип account — `oidc/oauth`). ON CONFLICT защищает от ошибки, но лишний RTT.
**Предложение:** убрать ветку `if (account?.provider === 'google' ...)` в signIn callback — adapter уже сделал работу. Оставить только email-ветку (где adapter не отрабатывает linking) и activity-event.
**Усилия:** XS.

#### H4 (новый). `notification_queue` без транзакций — потенциальный дубль уведомлений
**Где:** [app/api/cron/digest/route.ts:39-104](app/api/cron/digest/route.ts)
**Что:** Cron делает claim → send email → mark sent в трёх SQL-statements без atomicity. Если процесс упадёт после `Resend.emails.send` но до `UPDATE sent_at`, при следующем запуске reclaim вернёт строку → дубль письма. На одной реплике GitHub Actions риск низкий, но архитектурно не закрыт. Зависит от C2.
**Усилия:** S (после C2).

#### H5 (новый). `bookSubmissions.bookId` ON DELETE SET NULL → orphan approved submissions
**Где:** [lib/db/schema.ts:93](lib/db/schema.ts)
**Что:** Если админ удалит книгу из каталога (через `/api/admin/books/[id]`), у approved `book_submissions.book_id` обнуляется. Submission остаётся `status='approved'` без связи с книгой. В админке это может выглядеть странно.
**Предложение:** добавить app-логику — запретить hard-delete книги с активными signups/submissions; рекомендовать `visibility='hidden'` вместо delete.
**Усилия:** XS-S.

---

### Medium

#### M1. `user_activity_events` без читателя (повтор H5 из фазы 1)
**Где:** [lib/user-activity.ts:42-66](lib/user-activity.ts)
**Что:** Без изменений. Writer параллельно поддерживает `users.lastActivityAt` для админки. De-facto принят вариант (b) "оставить", но без комментария в коде.
**Предложение:** добавить комментарий в `bestEffortRecordUserActivity` — "writer also maintains users.last_activity_at; do not truncate without removing that dependency". Или вариант (c) — упростить: дропнуть таблицу, оставить только UPDATE `users.lastActivityAt`.
**Усилия:** XS (b) / S (c).

#### M2 (новый). PK `(user_id, book_id)` не покрывает обратный поиск
**Где:** [lib/db/schema.ts:117-126](lib/db/schema.ts)
**Что:** B-tree PK на `(user_id, book_id)` поддерживает поиск по `user_id` или `(user_id, book_id)`, но не по одному `book_id`. CASCADE при `DELETE FROM books` делает full scan на `signup_books` и `book_priorities`. То же для отчётов "сколько юзеров записаны на книгу X" в `lib/books.ts:83-87`.
**Предложение:**
```sql
CREATE INDEX signup_books_book_id_idx ON signup_books (book_id);
CREATE INDEX book_priorities_book_id_idx ON book_priorities (book_id);
```
После H2 — один индекс на объединённой таблице.
**Усилия:** XS.

#### M3 (новый). `ts` параметр в URL `/auth/telegram?ts=...` избыточен
**Где:** [lib/auth.ts:121-133](lib/auth.ts), [app/auth/telegram/page.tsx](app/auth/telegram/page.tsx)
**Что:** В query string `/auth/telegram` передаётся `ts` (clock-time) и сверяется с `now`. Но `ts` может быть подделан атакующим — реальная защита через `consumeTelegramPreauthToken` (`expiresAt > now AND usedAt IS NULL`). Параметр избыточен, попадает в Referer/историю — лишняя поверхность.
**Предложение:** убрать `ts` из URL и из проверки в `authorize`.
**Усилия:** XS.

#### M4. Partial index на `notification_queue` (повтор M4 фазы 1)
Не реализовано. См. план фазы 1.

#### M5. Hard-check `VERCEL_ENV === 'production'` (повтор M6 фазы 1)
Не реализовано. [lib/test-mode.ts](lib/test-mode.ts) без изменений.

#### M6. `force-dynamic` на auth-handlers (повтор M9 фазы 1)
Не реализовано полностью. На `/api/auth/telegram/callback` уже есть, на `/api/auth/[...nextauth]` — нет.

#### M7. JSON-as-text (повтор M2 фазы 1)
Реализовано только для `books.tags`. Осталось: `user_identities.metadata`, `user_activity_events.metadata`, `notification_queue.added_books`, `users.languages`.

#### M8. Cookies / CSRF settings (новый)
**Где:** [lib/auth.ts:96-251](lib/auth.ts)
**Что:** Нет явной конфигурации `cookies`, `useSecureCookies`, `trustHost`. NextAuth v5 в проде дефолтит на secure + sameSite='lax', что норм. Telegram callback (GET) не проходит CSRF preflight, но защищён HMAC. Защита-в-глубину — явный `cookies` блок с `__Host-` префиксом для CSRF token.
**Усилия:** S.

#### M9 (новый). `user_identities` нет индекса на `email`
**Где:** [lib/db/schema.ts:33-46](lib/db/schema.ts), [lib/auth-adapter.ts:42-47](lib/auth-adapter.ts)
**Что:** `getUserByEmail` делает `OR (email = X, providerAccountId = X)` без индекса на `email` → seq scan. Сейчас ок (мало строк), при росте — добавить индекс.
**Усилия:** XS.

---

### Low

#### L1. `feedback` ON DELETE SET NULL (GDPR-сомнительно)
[lib/db/schema.ts:131-136](lib/db/schema.ts). Без изменений.

#### L2. `tag_descriptions` без FK на каталог
**Что:** Тэг — строка в `books.tags` jsonb-массиве и в `tag_descriptions.tag`. Нет structural enforcement, что описанный тэг где-то используется. При удалении тэга из всех книг — `tag_descriptions` row остаётся orphan.
**Усилия:** XS (cleanup) / M (нормализация в отдельную таблицу).

#### L3. `books.published_date` хранится как text вольного формата
[lib/db/schema.ts:65](lib/db/schema.ts), seed в `0021`. Невозможно сортировать корректно — используется `published_at` timestamp как fallback. На малых объёмах ок.

#### L4. URL с pre-auth token виден в истории браузера (повтор L6 фазы 1)
Без изменений.

#### L5. Дубль селекта в `lib/admin-users.ts:148-217`
Минорная неэффективность — `users` селектится дважды в `getAdminUserDetails`.

#### L6. Двойная нормализация Telegram username
**Где:** [lib/user-identities.ts:179-181,227-237](lib/user-identities.ts)
**Что:** Username пишется и в `user_identities.telegram_username`, и в `users.contacts` (последнее — только если пусто). Источник правды для отображения в админке — `users.contacts` через `formatTelegramDisplay`. Минорный долг, разойтись могут только при смене username между сессиями.
**Усилия:** XS (документировать) / S (унифицировать).

---

## 6. План фазы 2

Логика порядка: сначала **закрыть унаследованные Critical** (часы работы), потом **транзакционная инфраструктура**, потом **остальные находки**.

### Шаг 1. Срочные точечные правки (несколько часов)
- **C1** — ✅ явная очистка `notification_queue` перед `delete(users)` в `/api/admin/delete-user` и `/api/user`. (XS)
- **C4** — ✅ поправить `handleIdentitySyncError`: `console.error` без throw для всех ошибок кроме `IdentityConflictError`. (XS)
- **H3** — убрать дублирующий `linkIdentityToUser` для google из signIn callback (adapter уже всё делает). (XS)
- **M3** — убрать параметр `ts` из URL `/auth/telegram` и из проверки в `authorize`. (XS)
- **M5** — добавить `process.env.VERCEL_ENV !== 'production'` в `isTestEndpointAllowed`. (XS)
- **M6** — `export const dynamic = 'force-dynamic'` в `/api/auth/[...nextauth]/route.ts`. (XS)

### Шаг 2. Telegram flooding (день)
- **C3** — rate-limit на `/api/auth/telegram/callback` (Upstash/Vercel KV) + one-active-token-per-user в `createTelegramPreauthToken` + batched cleanup чаще. (M)

### Шаг 3. Транзакционная инфраструктура (день-два)
- **C2** — ✅ переключить `lib/db/index.ts` на `drizzle-orm/neon-serverless`. Регрессионные тесты auth-флоу. Убрать fallback в `withIdentityTransaction`. (M)
- После этого автоматически закрывается **H4** (digest cron atomicity).

### Шаг 4. Целостность email и индексы (день)
- **H1** — ✅ проверочный SQL на дубли + UNIQUE INDEX `lower(contact_email)` + backfill. То же для `user_identities.email`. (S)
- **M2** — индексы `signup_books_book_id_idx` и `book_priorities_book_id_idx`. (XS)
- **M4** — partial index `notification_queue (processing_at) WHERE sent_at IS NULL`. (XS)
- **M9** — индекс на `user_identities.email`. (XS)

### Шаг 5. Объединение signup_books + book_priorities (день)
- **H2** — миграция теперь тривиальная (PK совпадает). Уменьшается код в `/api/signup`, `/api/admin/remove-book`, `/api/admin/signup-books`, `lib/admin-users.ts`. (S)
- После — M2 переделать на один индекс в объединённой таблице.

### Шаг 6. Чистка (по дню за пункт)
- **H5** — запретить hard-delete книг с linked submissions/signups (или авто-`visibility='hidden'`). (XS-S)
- **M1** — комментарий в `lib/user-activity.ts` либо решение об упрощении до варианта (c). (XS / S)
- **M7** — `text → jsonb` для оставшихся metadata-полей. (S/M)
- **M8** — явный cookies-блок в NextAuth с `__Host-` префиксом. (S)
- **L1** — GDPR-cleanup для `feedback` (триггер чистки name/email при delete user). (XS)

### Что НЕ нужно делать
- Возвращать `account`/`session` таблицы — кастомный adapter работает.
- Глобально переписывать tag-storage — текущее решение (jsonb + tag_descriptions) подходит для текущих объёмов.

---

## Краткий итог фазы 2

**Закрыто из плана фазы 1:** identity-модель → одна таблица, legacy auth dropped, denormalized columns в `users` убраны, intro bootstrap убран, priorities_set fixed, sessions table dropped, **Google Sheets полностью устранён** из runtime (бонусом).

**Не закрыто из плана фазы 1:** объединение `signup_books`+`book_priorities` (но стало проще — PK уже совпадает).

**Не закрыто из "за скобок":** C3 (Telegram rate-limit), M5/M6/M9.

**Новые проблемы:** H3 (двойная запись identity для Google), M2 (нет обратного индекса по book_id), M3 (избыточный `ts` в URL).

**Прогресс:** значительный. ~60% плана фазы 1 закрыто, главный архитектурный долг (identity-модель + sheets) ликвидирован. Остались точечные правки и инфраструктурный вопрос с транзакциями.

---

## Приложение А. Ключевые файлы

- [lib/db/schema.ts](lib/db/schema.ts) — актуальная схема (173 строки, 12 таблиц)
- [lib/auth.ts](lib/auth.ts) — NextAuth config (251 строка)
- [lib/auth-adapter.ts](lib/auth-adapter.ts) — кастомный IdentityAwareDrizzleAdapter (173 строки)
- [lib/user-identities.ts](lib/user-identities.ts) — identity-логика с tx-обёрткой (310 строк)
- [lib/db/index.ts](lib/db/index.ts) — driver (`neon-serverless`)
- [lib/telegram-auth.ts](lib/telegram-auth.ts) — HMAC + pre-auth tokens
- [lib/books.ts](lib/books.ts) — чтение каталога из БД
- [lib/intro.ts:50-52](lib/intro.ts) — бывший runtime CREATE TABLE (теперь no-op)
- [drizzle/0014..0027](drizzle/) — миграции с прошлого аудита
- [app/api/admin/delete-user/route.ts:24](app/api/admin/delete-user/route.ts) — всё ещё без cleanup queue
- [app/api/auth/telegram/callback/route.ts](app/api/auth/telegram/callback/route.ts) — всё ещё без rate-limit

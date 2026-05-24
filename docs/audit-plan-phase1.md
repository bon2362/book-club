# План работ — фаза 1

**Источник:** [audit-2026-05.md](audit-2026-05.md)
**Скоуп фазы:** 12 пунктов из основного аудита. Сознательно вынесены за скобки: вопрос транзакций (C2 — миграция на WebSocket-драйвер), GDPR-чистка `notification_queue` (C1), rate-limit Telegram (C3), судьба `user_activity_events` (H5), мелочи `feedback`/CHECK constraints/JSON в admin (L1, L2, L5, L6 и часть M).

**Порядок исполнения** — снизу вверх по риску: сначала точечные безопасные правки, потом чистка денормализаций в `users`, потом структурные миграции. Внутри этапов пункты можно делать параллельно.

**Обновление после Release B (`user_identities`):**
- `user_identities` теперь считается source of truth для provider-specific идентичностей. Колонки в `users` (`auth_provider`, `last_sign_in_at`, `telegram_username`) рассматриваются как legacy/cache/display-поля, а не как новая модель данных.
- В проде уже подтверждена дыра backfill-а: есть profile-only пользователи с `contacts/name`, но без `last_activity_at` и без `user_activity_events` (Катя/Полина). Это нужно закрыть отдельным пунктом до дальнейших cleanup-миграций.
- `drizzle-kit migrate`/journal уже показал рассинхрон на этом проекте. Все DB cleanup пункты ниже должны идти как idempotent SQL + предварительные SELECT-проверки + ручное применение/верификация в Neon, пока не исправлен C2/миграционный процесс.

**Зависимости от не-выбранных пунктов:**
- Пункт 12 (объединение `signup_books`/`book_priorities`) и пункт 2 (backfill `accounts→user_identities`) — содержат миграции на нескольких таблицах. Делать их безопаснее под транзакциями (C2). Без транзакций — выполнимо, но окно гонки во время миграции придётся либо принять, либо закрыть кратковременным maintenance-режимом (можно временно вернуть 503 из API через middleware).

---

## Этап 1. Быстрые точечные правки (часы работы)

### 1.1. Try/catch вокруг `linkIdentityToUser` в signIn callback
**Источник:** C4 в основном отчёте.
**Проблема:** Любая ошибка в identity-helper'е обрушивает весь signIn. Но не все ошибки одинаковые: конфликт "Google-аккаунт уже привязан к другому юзеру" — это security/consistency сигнал, его нельзя молча проглатывать как вторичный кэш.
**Файлы:** `lib/auth.ts:171-200`.
**Что сделать:**
1. Разделить expected/transient ошибки и conflict/linking ошибки.
2. Для conflict/linking (`already linked to another user`, provider/account collision) — блокировать вход или возвращать явную ошибку + лог/алерт.
3. Для transient DB/logging ошибок, если они не меняют owner identity, допустим best-effort path: `console.error`/Sentry и продолжение входа.
4. В идеале ввести typed errors в `lib/user-identities.ts` (`IdentityConflictError`), чтобы не парсить строки ошибок.
**Тесты:**
- unit на signIn callback: transient ошибка identity-sync не ломает вход;
- unit на signIn callback: identity conflict не проглатывается.
**Усилия:** S (typed error + 2 теста).

### 1.2. Удалить legacy Credentials провайдер `telegram` (без preauth)
**Источник:** L4.
**Проблема:** В `lib/auth.ts` зарегистрирован `Credentials({ id: 'telegram', ... })` — рудимент времён до перехода на pre-auth flow. В runtime используется только `telegram-preauth`. Висит в коде, путает читателя.
**Файлы:** `lib/auth.ts` (удалить provider), `e2e/telegram-auth.spec.ts` (проверить что тесты используют только preauth).
**Что сделать:** удалить определение провайдера и связанный `authorize`-handler.
**Тесты:** запустить `e2e/telegram-auth.spec.ts` — должны проходить.
**Усилия:** XS.

### 1.3. Сбрасывать `users.priorities_set` при удалении всех приоритетов
**Источник:** M7.
**Проблема:** Флаг ставится в `true` при первом ранжировании и нигде не обнуляется. После удаления всех записей на книги (через `/api/signup` с пустым списком) флаг остаётся `true`, админка показывает `prioritiesSet=true totalBooks=0`.
**Файлы:** `app/api/signup/route.ts:48-52` (ветка "все книги убраны"), `app/api/priorities/route.ts` (если будет случай удаления всего — пока такого нет).
**Что сделать:** после `delete bookPriorities` для юзера — `update users set prioritiesSet = false`. Альтернатива: вычислять из `count(book_priorities)` без хранения, но требует JOIN при чтении админкой.
**Тесты:** unit-тест на `/api/signup` — сабмит с пустым `selectedBooks` обнуляет флаг.
**Усилия:** XS.

⚠️ После пункта 12 (объединение таблиц) этот пункт упростится: флаг тогда можно вычислять как `EXISTS(SELECT 1 FROM signup_books WHERE userId=? AND rank IS NOT NULL)`. Решить — делать сейчас "правильно через UPDATE" и потом переделывать, или подождать пункт 12.

### 1.4. Проверить потребителей `/api/books`, выровнять или удалить
**Источник:** L3.
**Проблема:** `/api/books` отдаёт каталог книг, но без полей `whyForClub`, `recommendationLink`, `isNew`, `signupCount`, которые тащит главная страница. Возможно роут используется только в E2E или не используется вовсе.
**Файлы:** `app/api/books/route.ts`.
**Что сделать:**
1. `grep -rn "/api/books" --include="*.ts" --include="*.tsx" --include="*.spec.ts"` по проекту.
2. Проверить логи на проде (Vercel) — есть ли вызовы.
3. Если потребителей нет — удалить роут. Если есть E2E — переписать на server-side data fetch, удалить роут.
4. Если потребители есть и они продакшен (`/api/api-docs` к примеру может его использовать) — выровнять состав полей с `lib/books-with-covers.ts:34`.
**Усилия:** XS-S (зависит от потребителей).

### 1.5. Удалить мёртвую таблицу `session`
**Источник:** M1.
**Проблема:** NextAuth настроен на `session: { strategy: 'jwt' }` — таблица `session` не используется. Висит с FK на users.
**Файлы:** `lib/db/schema.ts:68-72`, новая миграция `drizzle/0014_drop_session_table.sql`.
**Что сделать:**
1. Подтвердить что в продакшен-БД таблица пуста (`SELECT count(*) FROM session;` через Neon dashboard).
2. Проверить совместимость `DrizzleAdapter(db)` без `sessions` export/table. Даже при JWT strategy адаптер может ожидать shape Auth.js tables.
3. Если совместимо — миграция: `DROP TABLE session;`, удалить `sessions` экспорт из `schema.ts`, переписать `/api/test/user` без `sessions`.
4. Если адаптер требует таблицу — оставить таблицу и добавить комментарий в `schema.ts`: `kept for Auth.js DrizzleAdapter compatibility; JWT sessions do not write rows`.
**Тесты:** smoke-test входа через Google и Email magic link.
**Усилия:** S (риск — DrizzleAdapter ругнётся, нужно проверить).

⚠️ Если DrizzleAdapter блокирует — оставить таблицу + добавить комментарий "kept for adapter compat" и пометить пункт как выполненный с пометкой "decision: keep".

---

## Этап 2. Чистка денормализаций в `users`

Этап лучше выполнять одним PR или короткой серией связанных PR — H2/H3/H4 взаимосвязаны. `last_sign_in_at` и `auth_provider` кандидаты на удаление из `users`; `telegram_username` сначала переводится в documented cache/display field с `user_identities` как source of truth.

### 2.1. Удалить колонку `users.lastSignInAt`
**Источник:** H4.
**Проблема:** Поле — дубль `userActivityEvents WHERE type='sign_in'` и/или `users.lastActivityAt`. Пишется в трёх местах (`lib/auth.ts:160`, `lib/user-identities.ts:185,310`), читается только в `/api/me/route.ts:23`, причём там одинаково подойдёт `lastActivityAt`.
**Файлы:** `lib/db/schema.ts:16`, `lib/auth.ts:160`, `lib/user-identities.ts:185,310`, `app/api/me/route.ts:23`, новая миграция.
**Что сделать:**
1. Заменить чтение `lastSignInAt` на `lastActivityAt` в `/api/me`.
2. Удалить writes (3 места).
3. Миграция: `ALTER TABLE "user" DROP COLUMN last_sign_in_at`.
**Тесты:** existing `/api/me` тесты + smoke-проверка.
**Усилия:** S.

### 2.2. Унифицировать `telegramUsername` — identities как source of truth, `users` как кэш
**Источник:** H3.
**Проблема:** Дублирование. Сейчас все читатели используют `users.telegramUsername`, а `user_identities.telegramUsername` почти не читается. Но после Release B именно `user_identities` — правильное место для provider-specific данных. `contacts` остаётся ручным контактом пользователя, `user_identities.telegram_username` — username, полученный от Telegram auth/preauth, `users.telegram_username` — только денормализованный кэш для UI/session.
**Файлы:** `lib/db/schema.ts`, `lib/user-identities.ts`, `lib/admin-users.ts`, `lib/auth.ts`, `app/api/me/route.ts`, `components/nd/*`, новая миграция только если решим удалять legacy cache.
**Что сделать:**
1. Зафиксировать правило в коде/комментарии: `user_identities.telegram_username` — source of truth для Telegram identity; `users.telegram_username` — nullable display/session cache.
2. Добавить helper чтения актуального Telegram username из identities, например `getUserTelegramIdentityDisplay(userId)` или расширить existing admin query.
3. Перевести новые server-side читатели (`admin-users`, `/api/me`) на helper/derived value, сохранив fallback на `users.telegram_username` на время перехода.
4. Оставить запись в оба места на переходный период: identities как truth, users как cache.
5. Отдельным Release D после стабилизации решить: удалить `users.telegram_username` или оставить как documented cache. Не удалять `user_identities.telegram_username`.
**Тесты:** существующие тесты на Telegram-вход + проверка что админка показывает username из identity при пустом `users.telegram_username`.
**Усилия:** S-M.

### 2.3. Удалить колонку `users.authProvider`
**Источник:** H2.
**Проблема:** Два разных нормализатора (`lib/auth.ts:32-34` vs `lib/user-identities.ts:62-67`) пишут разные значения в одно поле. В БД одновременно: `google`, `google-one-tap`, `email`, `telegram`, `telegram-preauth`. Плюс перезаписывается на каждом входе — теряется история.
**Файлы:** `lib/db/schema.ts:14-15`, `lib/auth.ts:32-34,158-162`, `lib/user-identities.ts:184,310`, `lib/admin-users.ts` (если используется), `components/nd/AdminPanel.tsx` (если отображается), новая миграция.
**Что сделать:**
1. Найти всех читателей: `grep -rn "authProvider" --include="*.ts" --include="*.tsx"`.
2. Везде, где нужен "последний провайдер юзера" — брать из `userIdentities ORDER BY lastSeenAt DESC LIMIT 1` (helper-функция в `lib/user-identities.ts`).
3. Удалить writes (3 места).
4. Миграция: `ALTER TABLE "user" DROP COLUMN auth_provider`.
5. Удалить функцию `normalizeAuthProvider` из `lib/auth.ts:32-34`.
**Тесты:** проверка что админка показывает провайдер корректно (берёт из identities).
**Усилия:** M.

⚠️ Возможный нюанс: где-то в админке может быть фильтр "только Google-юзеры" по `users.authProvider`. После удаления — фильтр будет работать через identities, придётся переписать SQL. Проверить `lib/admin-users.ts`.

---

## Этап 3. Завершение identity-миграции

### 3.1. Backfill `accounts → user_identities` для google-юзеров, убрать `syncGoogleAccount`
**Источник:** H1.
**Проблема:** Миграция 0013 добавила `user_identities`, но не сделала backfill из `accounts`. В результате `lib/user-identities.ts:132-143` читает `accounts` как fallback, а `syncGoogleAccount` явно пишет в `accounts` при каждом identity-write. Для Google идентичные данные пишутся в две таблицы.
**Файлы:** новая миграция `drizzle/0015_backfill_accounts_to_identities.sql`, `lib/user-identities.ts` (убрать `syncGoogleAccount` + читателей `accounts` как fallback).
**Что сделать:**
1. Миграция (idempotent):
```sql
INSERT INTO user_identities (id, user_id, provider, provider_account_id, email, created_at, last_seen_at)
SELECT
  gen_random_uuid(),
  a."userId",
  'google',
  a."providerAccountId",
  u.email,
  COALESCE(u.created_at, now()),
  COALESCE(u.last_activity_at, u.created_at, now())
FROM account a
JOIN "user" u ON u.id = a."userId"
WHERE a.provider = 'google'
ON CONFLICT (provider, provider_account_id) DO NOTHING;
```
2. Убрать функцию `syncGoogleAccount` из `lib/user-identities.ts:228-245`.
3. Убрать fallback-чтение `accounts` в `lib/user-identities.ts:132-143` — теперь все google-юзеры есть в identities.
4. Перепроверить — `accounts` остаётся как таблица для Resend verifyEmail flow и OAuth tokens (хотя tokens не используются — мы не дёргаем Google API от имени юзера).
**Тесты:** прогон существующих E2E на Google sign-in; smoke-проверка существующих юзеров через `/api/test/user`.
**Усилия:** M.

⚠️ Перед миграцией: `SELECT count(*) FROM account WHERE provider='google'` vs `SELECT count(*) FROM user_identities WHERE provider='google'` — разница покажет сколько строк добавится. Сравнить ожидаемое количество.

### 3.2. Backfill profile-only activity для пользователей без `last_activity_at`
**Источник:** follow-up после Release A/B и ручной проверки продовой БД.
**Проблема:** Есть пользователи, у которых заполнены `name/contacts` и есть `created_at`, но нет `last_activity_at`, `last_sign_in_at`, `signup_books` и `user_activity_events`. Пример на 20.05.2026: Катя Вахрамеева и Полина. В админке это выглядит как пустая "Последняя активность", хотя пользователь явно прошёл часть profile/signup flow.
**Файлы:** новая миграция `drizzle/0016_backfill_profile_only_activity.sql` (номер уточнить по фактической очереди), `drizzle/*migration.test.ts`.
**Что сделать:**
1. Предпроверка:
```sql
SELECT id, name, email, contacts, created_at, "emailVerified", last_activity_at
FROM "user"
WHERE last_activity_at IS NULL
  AND (contacts IS NOT NULL OR name IS NOT NULL);
```
2. Вставить idempotent события в `user_activity_events` для таких пользователей. Тип выбрать продуктово:
   - `profile_submitted`, если есть `contacts`;
   - иначе `user_created`.
3. `occurred_at` брать из `COALESCE("emailVerified", created_at)`.
4. Обновить `users.last_activity_at` из созданных событий тем же max-паттерном, что в `0012_user_activity_events.sql`.
5. Не трогать пользователей без `name/contacts`, чтобы не превращать техническое создание user row в активность.
**Тесты:** migration test на idempotency и на то, что профиль без книг получает activity event.
**Усилия:** XS-S.

---

## Этап 4. Структурные миграции

### 4.0. Общий протокол для DB-миграций этой фазы
**Источник:** опыт Release A/B.
**Проблема:** На проекте уже был рассинхрон Drizzle migration journal, поэтому крупные DB-изменения нельзя планировать как blind `drizzle-kit migrate`.
**Что сделать для каждого DB-пункта ниже:**
1. Написать idempotent SQL (`IF EXISTS`/`IF NOT EXISTS`/`ON CONFLICT DO NOTHING`) там, где это возможно.
2. Перед применением выполнить SELECT-проверки, указанные в пункте.
3. Применять миграцию в Neon вручную или через проверенный script runner, сохраняя вывод statement-by-statement.
4. После применения проверить schema/data invariant отдельными SELECT.
5. Синхронизировать `drizzle/meta/_journal.json` и snapshot только после фактической проверки.
6. Для write-sensitive миграций использовать maintenance window или временно закрыть write endpoints (`/api/signup`, `/api/priorities`, admin rename/delete) на время миграции.
**Тесты:** migration SQL tests + smoke build/typecheck.
**Усилия:** XS на каждый DB-пункт, но снижает риск.

### 4.1. Объединить `signup_books` и `book_priorities` в одну таблицу
**Источник:** H7.
**Проблема:** Две таблицы с одинаковым PK `(userId, bookName)` и неявной связью "приоритет = ранг внутри своих записей". Связь поддерживается вручную в `/api/signup`, нарушается `/api/admin/rename-book` (два UPDATE без транзакции), `/api/priorities` не enforces "ранг только на свои записи".
**Файлы:** `lib/db/schema.ts:118-133`, новая миграция (номер после фактической очереди, например `drizzle/0017_merge_priorities.sql`), `lib/signup-books.ts`, `app/api/priorities/route.ts`, `app/api/signup/route.ts:35-53`, `app/api/admin/rename-book/route.ts`, `lib/admin-users.ts:161-164`, тесты.

**Предмиграционная проверка** (выполнить на проде в Neon SQL editor):
```sql
SELECT bp.user_id, bp.book_name
FROM book_priorities bp
LEFT JOIN signup_books sb USING (user_id, book_name)
WHERE sb.user_id IS NULL;
```
Если результат пуст — миграция простой LEFT JOIN'ом. Если есть строки — продуктово решить: создать запись в signup_books или дропнуть приоритет.

**Новая схема:**
```ts
export const signupBooks = pgTable('signup_books', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookName: text('book_name').notNull(),
  signedAt: timestamp('signed_at', { mode: 'date' }).notNull().defaultNow(),
  rank: integer('rank'),  // nullable: записан, но не ранжировал
  rankUpdatedAt: timestamp('rank_updated_at', { mode: 'date' }),  // nullable
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookName] }),
}))
```

**Миграция:**
```sql
ALTER TABLE signup_books ADD COLUMN rank integer;
ALTER TABLE signup_books ADD COLUMN rank_updated_at timestamp;

UPDATE signup_books sb
SET rank = bp.rank,
    rank_updated_at = bp.updated_at
FROM book_priorities bp
WHERE sb.user_id = bp.user_id AND sb.book_name = bp.book_name;

-- если предмиграционная проверка показала осиротевшие приоритеты — решить отдельно
DROP TABLE book_priorities;
```

**Что менять в коде:**
- `lib/signup-books.ts` — `upsertSignup` пишет `rank: null` при INSERT новых записей.
- `app/api/priorities/route.ts` — заменить INSERT на UPDATE (книги уже есть в `signup_books`). Убрать `notInArray`-чистку (теперь невозможно ранжировать без подписи). Добавить проверку — все ли `validBooks` есть в `signup_books` для этого юзера; если нет — 400.
- `app/api/signup/route.ts:35-53` — удалить блок ручной чистки приоритетов.
- `app/api/admin/rename-book/route.ts:21-27` — оставить один UPDATE.
- `lib/admin-users.ts:161-164` — заменить на `SELECT bookName, rank FROM signup_books WHERE userId = ? AND rank IS NOT NULL ORDER BY rank`.

**Тесты:**
- Существующие unit/e2e на signup и priorities.
- Новый тест: сабмит profile с пустым `selectedBooks` каскадно удаляет ранее проставленный rank (раньше это делалось через явный delete, теперь — через CASCADE).
- E2E на drag-rank.

**Усилия:** S (день работы с тестами).

⚠️ Без транзакций (C2 не сделан): пользователь, который во время миграции дёргает `/api/priorities` или `/api/signup`, может попасть в момент когда колонка `rank` уже есть, но UPDATE с backfill ещё не прошёл — его данные могут затереться. Решение: или короткий maintenance-режим (middleware возвращает 503 на endpoints записи на 30 секунд), или сделать миграцию в момент низкого трафика. Чтения работают всегда.

### 4.2. Удалить runtime `CREATE TABLE` для `intro_sections`
**Источник:** M3.
**Проблема:** `lib/intro.ts:52-69` на каждый cold start выполняет `CREATE TABLE IF NOT EXISTS intro_sections (...)`. Рудимент времён до миграции 0006. Сейчас таблица уже создаётся миграциями.
**Файлы:** `lib/intro.ts:52-69`, новая миграция (если нужен seed) `drizzle/0017_seed_intro_sections.sql`.
**Что сделать:**
1. Проверить — пуста ли `intro_sections` в продакшене.
2. Если непуста — удалить функции `ensureIntroTable`/`bootstrap`/`seedIfEmpty`, оставить только `getIntroData`.
3. Если пуста или нужен seed — перенести seed-данные в SQL-миграцию.
**Тесты:** `/api/intro` GET возвращает данные.
**Усилия:** S.

### 4.3. Lowercase emails + unique index `lower(email)`
**Источник:** M5.
**Проблема:** `users.email` хранится как пришло из OAuth-провайдера (Google — обычно lowercase, Resend — как ввёл юзер). Identity-логика lowercased сравнения → возможен дубль юзеров с разным case в email.
**Файлы:** `lib/auth.ts` (или DrizzleAdapter override), новая миграция.
**Что сделать:**
1. Проверочный SQL: `SELECT email FROM "user" WHERE email != lower(email);` — сколько строк потребуют исправления.
2. Миграция:
```sql
UPDATE "user" SET email = lower(email) WHERE email != lower(email);
DROP INDEX IF EXISTS user_email_unique;  -- старый unique constraint на email
CREATE UNIQUE INDEX user_email_lower_idx ON "user" (lower(email));
```
3. В коде — везде где `INSERT users { email }` приводить к lower. Самое чистое — переопределить `createUser` в DrizzleAdapter, либо `signIn` callback приводит email до записи.
**Риск:** если есть юзеры с разным case в email, которые сейчас фактически разные аккаунты — миграция склеит их через UNIQUE. Перед миграцией проверочный SQL:
```sql
SELECT lower(email), array_agg(id) FROM "user"
GROUP BY lower(email) HAVING count(*) > 1;
```
Если есть коллизии — решить вручную (merge или suffix).
**Тесты:** unit-test что `signIn` с email `Alice@Gmail.com` находит существующего юзера с `alice@gmail.com`.
**Усилия:** S.

### 4.4. `text → jsonb` для metadata-полей
**Источник:** M2.
**Проблема:** JSON хранится как `text`, нельзя фильтровать содержимое в SQL.
**Поля:** `users.languages`, `notification_queue.added_books`, `user_activity_events.metadata`, `user_identities.metadata`.
**Файлы:** `lib/db/schema.ts`, новая миграция `drizzle/0018_jsonb_metadata.sql`, все читатели/писатели этих полей.
**Что сделать:**
1. Миграция: `ALTER TABLE ... ALTER COLUMN languages TYPE jsonb USING languages::jsonb` (на каждое поле).
2. В Drizzle schema — `text(...)` → `jsonb(...)`.
3. Все писатели: убрать `JSON.stringify` — Drizzle с `jsonb` сам сериализует. Все читатели: убрать `JSON.parse`.
4. Если в БД есть невалидный JSON — миграция упадёт. Перед миграцией проверочный SQL:
```sql
SELECT id, languages FROM "user" WHERE languages IS NOT NULL AND languages !~ '^[\[\{]';
```
**Тесты:** существующие тесты должны пройти после удаления JSON.stringify/parse.
**Усилия:** M (4 поля × правки в коде + миграция).

---

## Этап 5. Защита

### 5.1. Unit-тест на Email magic link
**Источник:** H6.
**Проблема:** Архитектурно nothing prevents create-user-on-request. По факту NextAuth защищён `verificationRequest=true` → возврат true рано, без создания user. Тест зафиксирует контракт.
**Файлы:** `lib/auth.test.ts` или новый `lib/auth-email.test.ts`.
**Что сделать:** unit-test:
- эмулировать вызов `signIn` callback с `email.verificationRequest = true` → user не создаётся в `users`;
- эмулировать вызов с `email.verificationRequest = false` (реальный callback после клика) → user создаётся.
**Усилия:** S.

⚠️ Этот пункт можно поднять в Этап 1 как защитную правку перед любыми дальнейшими изменениями auth-chain. Он маленький, но фиксирует важный инвариант после Release B.

---

## Финальный чек-лист (для трекинга)

- [ ] 1.1. Контролируемая обработка ошибок identity-sync в signIn (C4) — S
- [ ] 1.2. Удалить legacy `telegram` provider (L4) — XS
- [ ] 1.3. Сброс `priorities_set` (M7) — XS
- [ ] 1.4. Проверить/удалить `/api/books` (L3) — XS-S
- [ ] 1.5. `DROP TABLE session` (M1) — S
- [ ] 2.1. Удалить `users.lastSignInAt` (H4) — S
- [ ] 2.2. Унифицировать `telegramUsername`: identities truth, users cache/display (H3) — S-M
- [ ] 2.3. Удалить `users.authProvider` (H2) — M
- [ ] 3.1. Backfill `accounts → user_identities` (H1) — M
- [ ] 3.2. Backfill profile-only activity для пользователей без `last_activity_at` — XS-S
- [ ] 4.0. Протокол idempotent SQL/Neon для DB-миграций — XS на DB-пункт
- [ ] 4.1. Объединить `signup_books`/`book_priorities` (H7) — S
- [ ] 4.2. Удалить `intro_sections` runtime bootstrap (M3) — S
- [ ] 4.3. Lowercase emails + lower(email) index (M5) — S
- [ ] 4.4. `text → jsonb` для metadata (M2) — M
- [ ] 5.1. Unit-test на magic link (H6) — S

**Суммарно:** ~6-8 рабочих дней. Можно растягивать на 2-3 недели по одному пункту за раз — большинство пунктов изолированы, но DB-миграции лучше группировать только после готового протокола 4.0.

**Правила перед каждым коммитом** (из CLAUDE.md):
- `npm run lint && npm run typecheck && npm test` обязательны.
- Для пунктов, меняющих UI или auth chain — добавить E2E-тест.
- Перед миграциями БД — выполнить проверочные SQL в Neon dashboard.
- Перед каждым commit в ответе явно написать: `E2E: нужен / не нужен — [причина]`. Это видимый checklist-артефакт; в commit message дублировать необязательно.

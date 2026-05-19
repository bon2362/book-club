# План рефакторинга модели пользователей, идентичностей и активности

Дата: 2026-05-19

## Контекст

В админке обнаружились системные проблемы с отображением Telegram, даты создания и последней активности пользователей.

Текущая модель смешивает несколько разных понятий:

- внутренний пользователь сайта;
- внешний способ входа;
- контакт, введённый пользователем;
- Telegram username;
- факт регистрации;
- последняя активность;
- исторические строки из Google Sheets.

Из-за этого часть пользователей имеет неполные данные:

- `users.id` зависит от способа регистрации;
- Telegram-пользователи могут иметь id вида `telegram:<id>`;
- Google/email-пользователи имеют UUID;
- часть пользователей не имеет `last_sign_in_at`;
- часть пользовательских действий не сохраняется как активность;
- `contacts` и `telegram_username` трактуются по-разному в разных местах UI;
- `created_at` для старых пользователей был восстановлен эвристически и может быть неточным.

## Целевая модель

### users

`users.id` должен быть внутренним стабильным идентификатором, не зависящим от провайдера.

Целевое правило:

- `users.id` всегда UUID;
- provider-specific id не используется как primary key;
- внешний идентификатор хранится отдельно;
- `users.email` хранит реальный email, если он известен;
- synthetic email вида `telegram:<id>@telegram.user` не используется для новых пользователей.

Правило для `users.email`:

- до отдельной миграции nullable email поле остаётся `not null`, чтобы не ломать Auth.js adapter, существующие API и UI;
- на первом релизе для новых Telegram-пользователей допускается технический placeholder только если схема ещё требует `not null`, но он должен быть помечен как legacy/placeholder и не использоваться как реальный контакт;
- перед фактическим отказом от synthetic email нужно отдельным шагом сделать `users.email` nullable или добавить отдельное поле `contact_email`;
- все места, которые сейчас считают `user.email` обязательной строкой, должны быть найдены и обновлены до nullable-safe логики до изменения схемы;
- unique constraint на email должен учитывать nullable/placeholder политику, иначе Telegram-пользователи без реального email будут конфликтовать или получать фиктивные контакты.

Кешированные поля на `users`:

- `created_at`;
- `last_activity_at`;
- `telegram_username`;
- `contacts`;
- `auth_provider` как display/cache, но не как источник истины.

### user_identities

Новая таблица для внешних идентичностей.

Поля:

- `id`;
- `user_id`;
- `provider`: `google`, `email`, `telegram`;
- `provider_account_id`;
- `email`;
- `telegram_username`;
- `created_at`;
- `last_seen_at`;
- `metadata`.

Ограничения:

- `unique(provider, provider_account_id)`;
- `user_id` ссылается на `users.id`;
- один пользователь может иметь несколько identity;
- `provider`, `type` activity events и `source` должны быть типизированы через enum/const union в коде, а не свободным текстом;
- для `email` identity `provider_account_id` = normalized email, но linking по email разрешён только по verified/trusted email.

Примеры:

- Google OAuth: `provider = google`, `provider_account_id = Google sub`;
- Google One Tap: то же самое;
- Email magic link: `provider = email`, `provider_account_id = normalized email`;
- Telegram: `provider = telegram`, `provider_account_id = Telegram numeric id`.

### Auth.js `account` coexistence

На первом релизе `account` остаётся таблицей Auth.js adapter и продолжает обслуживать OAuth/session compatibility.

Правило владения:

- `account` — техническая таблица Auth.js, нужная для DrizzleAdapter и OAuth;
- `user_identities` — доменная таблица приложения и источник истины для админки, linking и display/cache полей;
- для Google OAuth и Google One Tap запись в `account` и `user_identities` должна создаваться/обновляться в одной транзакции;
- `account.provider/providerAccountId` и `user_identities.provider/provider_account_id` должны иметь одинаковый canonical provider id для Google;
- Resend/email magic link может не иметь `account` row, поэтому email identity обязательна;
- Telegram credentials/preauth не должен зависеть от `account`, но обязан иметь Telegram identity;
- любое расхождение между `account` и `user_identities` должно попадать в migration/backfill report.

До переключения auth нельзя удалять или обходить `account`, иначе возможны `OAuthAccountNotLinked` и дубли пользователей при Google OAuth.

### user_activity_events

Новая таблица для явной записи активности.

Поля:

- `id`;
- `user_id`;
- `type`;
- `occurred_at`;
- `source`;
- `source_id`;
- `dedupe_key`;
- `metadata`.

Базовые типы:

- `user_created`;
- `sign_in`;
- `profile_submitted`;
- `profile_updated`;
- `books_selected`;
- `priorities_updated`;
- `submission_created`;
- `feedback_created`;
- `sheets_import`.

После записи события обновлять `users.last_activity_at`.

Правила идемпотентности:

- каждое событие, восстановленное из внешнего источника, получает стабильный `dedupe_key`;
- рекомендуемый формат: `${source}:${type}:${source_id}` для событий с исходным id и `${source}:${type}:${user_id}:${occurred_at}` только если исходного id нет;
- backfill должен использовать upsert по `dedupe_key`, а не plain insert;
- runtime-события могут иметь `dedupe_key = null`, если они действительно являются новым действием пользователя, но retry-prone route handlers должны задавать ключ;
- `users.last_activity_at` обновляется только как максимум текущего значения и `occurred_at`, чтобы старый backfill не откатывал активность назад.

## Helper-слой

Вынести создание и поиск пользователей в единый слой.

Нужные функции:

- `resolveOrCreateUserFromIdentity(provider, providerAccountId, profile)`;
- `linkIdentityToUser(userId, identity)`;
- `recordUserActivity(userId, type, occurredAt?, metadata?, options?)`;
- `normalizeTelegramContact(rawContact)`;
- `formatTelegramDisplay(user)`;
- `updateUserActivityCache(userId)`.

Транзакционные требования:

- `resolveOrCreateUserFromIdentity` выполняется внутри DB transaction;
- поиск identity, создание user, создание identity, sync `account`, запись `user_created/sign_in` и обновление кешей должны быть атомарными;
- при конфликте `unique(provider, provider_account_id)` функция перечитывает существующую identity и возвращает связанного user, а не создаёт второго;
- linking новой identity к существующему user по email разрешён только если email verified/trusted и нет другой identity с тем же provider account;
- `recordUserActivity` должен поддерживать upsert по `dedupe_key` и обновлять `last_activity_at` через max/greatest;
- helper-слой не должен принимать сырые provider names из UI без нормализации (`resend` -> `email`, `telegram-preauth` -> `telegram`, `google-one-tap` -> `google`).

Auth callbacks, route handlers и админка не должны вручную решать:

- какой id создать;
- куда писать provider id;
- как нормализовать Telegram;
- что считать активностью.

## Разбиение на релизы

### Релиз A. Activity/admin consistency без смены canonical auth

Цель: починить админку, историю активности и display-логику без изменения `users.id` для новых auth flows.

Входит:

- схема `user_activity_events`, `users.last_activity_at`, helper для активности;
- единый Telegram formatter;
- idempotent backfill событий;
- переключение админки на `last_activity_at` и единый display;
- сохранение текущей auth-модели и текущей роли `account`.

Не входит:

- отказ от synthetic Telegram email;
- изменение `users.id` для новых Telegram-пользователей;
- физическая миграция legacy `telegram:*` ids;
- удаление или замена Auth.js `account`.

### Релиз B. Identity-based auth для новых пользователей

Цель: новые пользователи всех провайдеров получают UUID, внешние ids хранятся в `user_identities`.

Входит:

- `user_identities`;
- транзакционный `resolveOrCreateUserFromIdentity`;
- sync с `account` для Google;
- Telegram callback/preauth с UUID user id и Telegram identity;
- email/nullability решение для пользователей без реального email;
- обновление test-mode endpoints, чтобы E2E проверяли новую модель.

### Релиз C. Legacy physical id migration, опционально

Цель: заменить старые `telegram:*` primary keys на UUID после стабилизации.

Это отдельный релиз с audit mapping, FK migration и rollback-планом.

## Этапы работ

### Этап 1. Подготовить схему

Добавить:

- `user_identities`;
- `user_activity_events`;
- `users.last_activity_at`;
- при необходимости `users.created_at_source`.

Для релиза A можно добавить только activity/admin часть схемы. `user_identities` допускается отложить до релиза B, если auth не переключается.

Не менять поведение приложения на этом этапе.

Проверки:

- Drizzle migration;
- unit-тесты на схему/helper-слой;
- typecheck.

### Этап 2. Добавить helper-слой без переключения auth

Реализовать:

- создание/поиск identity;
- запись активности;
- нормализацию Telegram;
- общий formatter для Telegram display.

Админка пока может продолжать читать старые поля.

### Этап 3. Начать писать activity events

Подключить `recordUserActivity` в существующие flows:

- успешный sign-in;
- `/api/signup`, даже если `selectedBooks = []`;
- `/api/profile`;
- `/api/priorities`;
- `/api/submissions`;
- `/api/feedback`.

Важно: заполнение профиля без выбранных книг должно считаться активностью.

### Этап 4. Backfill из текущей БД и Google Sheets

Одноразово восстановить события из источников:

- `users.emailVerified`;
- `users.last_sign_in_at`;
- `account`;
- legacy `telegram:*` ids;
- `signup_books.signed_at`;
- `book_priorities.updated_at`;
- `book_submissions.created_at`;
- `feedback.created_at`;
- Google Sheets `signups`, включая строки с `selected_books = []`.

Для каждого восстановленного события указать `source`.

Пример:

- Катя Вахрамеева должна получить событие `profile_submitted` или `sheets_import` на `2026-02-23T07:48:40.460Z`.

Для пользователей без внешних исторических источников оставить самый ранний известный факт и явно зафиксировать source.

Runbook:

1. Подготовить dry-run скрипт, который ничего не пишет и выводит counts по source/type, число затронутых users, число конфликтов dedupe, число пользователей без исторических источников.
2. Зафиксировать snapshot текущих агрегатов: `users.created_at`, `users.last_sign_in_at`, вычисленная текущая admin activity, counts по `signup_books`, `book_priorities`, `book_submissions`, `feedback`.
3. Запустить backfill в staging/preview DB и сохранить отчёт.
4. Проверить invariants: нет activity без user, `users.last_activity_at = max(user_activity_events.occurred_at)`, нет дублей по `dedupe_key`, число событий по source совпадает с dry-run.
5. Запустить production backfill батчами. Каждый batch должен быть идемпотентным и безопасным для повторного запуска.
6. После production backfill повторить отчёт и сравнить с dry-run.
7. Rollback-план: удалить события по `source`/`migration_run_id`, пересчитать `users.last_activity_at` из оставшихся событий и `last_sign_in_at`.

Алгоритм `created_at`:

- если у пользователя есть уже установленный `users.created_at`, не перезаписывать его без явного `created_at_source`;
- canonical `created_at` для backfill = самый ранний trusted факт о пользователе;
- порядок источников при равной дате: существующий `users.created_at`, `emailVerified`, earliest `account`/identity created, earliest signup/profile sheets row, earliest `signup_books.signed_at`, earliest `book_priorities.updated_at`, earliest `book_submissions.created_at`, earliest `feedback.created_at`;
- если найденная historical date раньше текущего `users.created_at`, обновить `users.created_at` и записать `created_at_source`;
- если источник сомнительный, не менять `users.created_at`, а создать event с `source` и отметить uncertainty в `metadata`.

### Этап 5. Переключить админку на новую модель

Админка должна читать:

- Telegram через единый formatter;
- дату создания из `users.created_at`;
- последнюю активность из `users.last_activity_at`;
- при необходимости детали активности из `user_activity_events`.

Таблица и drawer должны использовать одну и ту же логику отображения контакта.

### Этап 6. Перевести auth на identity-based модель

Google OAuth:

- оставить UUID `users.id`;
- Google `sub` хранить как identity.

Google One Tap:

- убрать отдельную ручную модель;
- использовать тот же `resolveOrCreateUserFromIdentity('google', sub, profile)`.

Email:

- UUID `users.id`;
- email хранить как identity `provider = email`.

Telegram:

- новые пользователи получают UUID;
- Telegram numeric id хранится в `user_identities`;
- `telegram_username` обновляется из Telegram profile;
- synthetic email больше не создаётся для новых Telegram-пользователей.

Session/preauth contract:

- `session.user.id` всегда содержит canonical `users.id`;
- Telegram callback создаёт или находит user по Telegram identity, затем создаёт preauth token для canonical UUID user id;
- `/auth/telegram?uid=...` передаёт canonical user id, а Telegram numeric id хранится только в identity/metadata;
- `telegram-preauth` provider после consume token перечитывает user по canonical id и не пытается искать `telegram:*`;
- legacy `telegram:*` uid поддерживается только в compatibility path и должен быть покрыт отдельным тестом.

### Этап 7. Legacy compatibility

На переходный период поддерживать существующих пользователей:

- `telegram:*` id;
- synthetic Telegram email;
- старые строки без `account`;
- старые строки без `last_sign_in_at`.

Не делать физическую миграцию primary key сразу, если это увеличивает риск.

Compatibility contract:

- старые `telegram:*` users остаются валидными `session.user.id`;
- helper-слой умеет найти Telegram identity по legacy id и создать missing identity без изменения PK;
- synthetic Telegram email считается display-forbidden: его нельзя показывать пользователю как реальный email;
- API, которые принимают user id из path/query, должны продолжать принимать `telegram:*` id через `encodeURIComponent`;
- test endpoints (`/api/test/session`, `/api/test/user`, `/api/test/signup`) должны быть обновлены под новую модель, иначе E2E будут проверять старый обходной путь.

### Этап 8. Опциональная миграция legacy Telegram ids

После стабилизации можно рассмотреть физическую миграцию:

- создать UUID для каждого legacy `telegram:*` пользователя;
- обновить все FK;
- создать identity `provider = telegram`;
- сохранить audit mapping старый id -> новый id.

Это отдельная рискованная задача, не часть первого релиза.

## Риски

- Физическая миграция `users.id` затрагивает много FK.
- Auth.js callbacks и DrizzleAdapter могут создавать пользователей разными путями.
- Старые Google Sheets данные неполные.
- Для части пользователей невозможно восстановить реальную дату создания без внешних логов.
- Смена identity-модели может затронуть E2E Telegram auth.
- Nullable email затрагивает Auth.js adapter, API responses, admin UI и notification flows.
- Два источника identity (`account` и `user_identities`) могут разойтись без transaction/sync правил.
- Backfill может создать правдоподобные, но неверные события без dedupe и dry-run отчёта.
- Неправильный update `last_activity_at` может откатить активность назад при восстановлении старых событий.
- Linking по email может случайно объединить аккаунты разных людей, если не ограничить его verified/trusted email.

## Тесты

Unit:

- нормализация Telegram;
- создание identity;
- idempotent linking;
- запись activity events;
- backfill из Sheets с `selected_books = []`;
- вычисление `created_at` и `last_activity_at`;
- `last_activity_at` не откатывается назад при записи старого события;
- повторный backfill не создаёт дубли по `dedupe_key`;
- synthetic Telegram email не возвращается как display email;
- provider normalization: `resend` -> `email`, `telegram-preauth` -> `telegram`, `google-one-tap` -> `google`.

Integration/API:

- Google OAuth/One Tap создаёт UUID user + identity;
- Telegram создаёт UUID user + Telegram identity;
- email magic link создаёт/находит user + email identity;
- `/api/signup` пишет activity даже без книг;
- admin users API отдаёт нормализованные поля;
- Google OAuth/One Tap создаёт согласованные rows в `account` и `user_identities`;
- Telegram callback создаёт preauth token для canonical user id;
- legacy `telegram:*` пользователь продолжает логиниться;
- `/api/test/session` и связанные test endpoints создают данные в той же модели, что production flow.

E2E:

- Telegram auth;
- Google/test auth;
- заполнение профиля без выбора книг;
- админка показывает Telegram, created date и last activity одинаково в таблице и drawer;
- перезагрузка страницы сохраняет состояние.

Migration/invariant checks:

- нет `user_activity_events.user_id` без существующего user;
- `users.last_activity_at` равен max `occurred_at` по событиям пользователя;
- нет дублей по non-null `dedupe_key`;
- нет двух users на один `(provider, provider_account_id)`;
- для Google identities есть соответствующая `account` row или явно documented exception;
- число restored events по source совпадает с dry-run report.

## Критерии готовности

### Релиз A

- Все значимые действия пишут `user_activity_events`.
- `users.last_activity_at` обновляется при активности и не откатывается назад.
- Backfill прошёл dry-run, production run и invariant checks.
- Админка больше не выводит разные Telegram-значения в таблице и drawer.
- `users.created_at` не зависит от времени миграции, если есть trusted исторический источник.
- Старые пользователи остаются работоспособными.
- CI, unit, typecheck и релевантные E2E проходят.

### Релиз B

- Новые пользователи всех провайдеров получают UUID `users.id`.
- Внешние provider ids не используются как canonical user id.
- `user_identities` является источником истины для provider ids.
- `account` и `user_identities` согласованы для Google OAuth/One Tap.
- Telegram auth использует canonical UUID в session/preauth.
- Email/nullability policy реализована и покрыта тестами.
- CI, unit, typecheck и релевантные E2E проходят.

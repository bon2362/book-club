---
status: complete
date: '2026-07-12'
scope: 'current Matching UI, server state, schema, transactions, tests, audit and rollout'
inputs:
  - 'docs/planning-artifacts/prd-matching-books.md'
  - 'docs/planning-artifacts/architecture-matching-books.md'
  - 'docs/brainstorming/brainstorming-session-2026-07-12-195055.md'
---

# Технический аудит — книжный режим Matching

## Итог

Текущая реализация даёт сильную инфраструктурную основу: session membership, `state_version`, `SELECT … FOR UPDATE`, единый `withAuditContext` executor, публичные ссылки участников, version polling и готовый session shell. Однако текущие confirmations/locked circles и `active|frozen` lifecycle семантически несовместимы с новой моделью.

Книжный режим нельзя безопасно получить преобразованием сценариев. Нужны новые canonical entities для intent, formed book, assignment и circle placement, но их мутации должны проходить через существующий matching transition executor.

## Карта текущего UI и data flow

1. `app/matching/page.tsx:24-121` выполняет auth/session/join развилки.
2. `app/matching/page.tsx:123-170` и `lib/matching/personal-list.ts:69-120` загружают опубликованные книги и персональное состояние; `buildPublicBookParticipants` уже строит проекцию людей по книгам (`lib/matching/book-participants.ts:18-35`).
3. `app/matching/page.tsx:172-212` отдельно собирает public state через `lib/matching/public-state-db.ts:26-143` и `lib/matching/public-state.ts:108-234`.
4. `components/nd/MatchingRealtimeClient.tsx:78-147` сравнивает version, загружает full state и вызывает refresh; это готовый shell для двух вкладок.
5. `components/nd/MatchingScenarios.tsx:48-105` подтверждает exact scenario circle, а не книгу.
6. `components/nd/MatchingPersonalList.tsx:170-190` уже показывает co-signups, но сортируется по rank (`:192-199`) и хранит другой набор статусов.
7. Текущий admin находится в отдельном `AdminMatchingSession.tsx`, умеет session/participant/locked-circle операции, но не межкнижное редактирование (`components/nd/AdminMatchingSession.tsx:407-458,582-687`).

## Что переиспользуется

- Auth, welcome, join и session membership: `app/matching/page.tsx`, `MatchingWelcome.tsx`.
- Header, deadline, participant count и admin indication: `MatchingHeader.tsx`.
- Публичные `publicRef` и display names: `book-participants.ts`, `public-state.ts`.
- Cover/detail primitives: `CoverImage`, `MatchingBookDetailModal`, detail provider.
- Version polling и pending/reconciliation: `MatchingRealtimeClient.tsx`, `MatchingBoardProvider.tsx`.
- Единый mutation choke-point: `runMatchingTransition` в `session-transition-db.ts:641`.
- Audit transaction: `withAuditContext` в `lib/audit/with-audit-context.ts:19`.
- Session serialization: `SELECT … FOR UPDATE` в `session-transition-db.ts:53`.
- Stale version check и single version bump: `session-transition.ts:282,383`.
- Semantic `matching_events` и DB audit log: `lib/db/schema.ts:357,394`.

## Несовместимости текущей модели

### Confirmations выбирают не тот объект

`matching_circle_confirmations` хранит `circleKey` и snapshot точного сценарного состава (`lib/db/schema.ts:294-308`). Новая модель выбирает книгу до существования круга. Таблицу нельзя расширить полем `kind` без смешения двух разных агрегатов.

### Locked circle смешивает два уровня

`matching_locked_circles` и members одновременно означают назначение на книгу, конкретный состав и блокировку (`lib/db/schema.ts:310-343`). Новая модель требует независимых assignment и circle placement.

### Формирование построено на единогласии

Текущий lock возникает после подтверждения каждого участника exact-circle (`lib/matching/session-transition.ts:250`). Требование `H≥2 && H+C≥3` работает до вычисления сценария и назначает людей с несколькими conditional intents.

### Одна книга запрещена в нескольких кругах

Scenario engine исключает повтор книги внутри сценария (`lib/matching/scenarios.ts:394-403`). Новая модель специально создаёт несколько кругов по одной популярной книге.

### Frozen несовместим с close/reopen

Схема допускает только `active|frozen` (`lib/db/schema.ts:260-266`); frozen блокирует все мутации (`session-transition.ts:282-285`), а freeze удаляет confirmations (`session-transition-db.ts:370-384`). Новый close сохраняет данные, разрешает admin edits и допускает reopen.

### UI state разделён на две версии данных

SSR `bookParticipants` и client `publicState` собираются разными pipelines (`app/matching/page.tsx:132-212,236-240`). Книжная вкладка требует одного versioned DTO, иначе пересечения и signals будут расходиться после polling.

### Shortlist mutations обходят сильные обязательства

Текущее удаление signup всегда удаляет запись и rank (`MatchingPersonalList.tsx:568-580`, `session-transition-db.ts:416-430`). Новая модель требует очистить conditional, потребовать cancel для hard и запретить user removal для assignment.

### Closed-session binding может быть обойдён

Catalog choke-point ищет только active session (`lib/matching/realtime/state-change.ts:21`). После close обычный catalog route сможет изменить книгу, связанную с hard/assignment, если lookup не учитывать текущую закрытую сессию.

### Impersonation refresh имеет риск смены viewer

Первичная загрузка поддерживает `?as=`, но polling full-state fetch не сохраняет параметр (`MatchingRealtimeClient.tsx:78-81`, `app/api/matching/state/route.ts:21-27`). Новый admin book mode лучше не строить на participant impersonation.

## Рекомендуемое хранение

### `matching_book_intents`

| Поле | Назначение |
|---|---|
| `session_id`, `user_id`, `book_id` | composite identity |
| `kind` | `conditional` или `hard` |
| `created_at`, `updated_at` | порядок и аудит |

Constraints: PK `(session_id,user_id,book_id)`; partial unique hard на `(session_id,user_id)`; FK participant/book; индекс `(session_id,book_id,kind,created_at)`.

### `matching_session_book_states`

PK `(session_id,book_id)`, `formed_at`, `formed_state_version`. Маркер отделяет факт формирования от текущего числа assignments после admin override.

### `matching_book_assignments`

PK `(session_id,user_id)` обеспечивает один слот. Поля `book_id`, `source: hard|conditional|admin|legacy`, `assigned_at`, `assigned_by`, nullable `circle_id`. Индекс чтения `(session_id,book_id,assigned_at,user_id)`.

### `matching_circles`

UUID `id`, `session_id`, `book_id`, `position`, timestamps, nullable unique `legacy_locked_circle_id`. Размер вычисляется по assignments; DB не ограничивает 3–5. Composite FK assignment → circle гарантирует совпадение session/book, а legacy ID делает live migration идемпотентной и прослеживаемой.

### Derived interest

Interest не дублируется: session participant + актуальный `signup_books` + допустимый personal status. `book_priorities` остаётся legacy входом сценарного режима.

## Транзакционные границы

### Общий протокол

Каждая команда внутри одного `withAuditContext`:

1. блокирует session row;
2. проверяет `expectedStateVersion`;
3. проверяет actor/role/session state;
4. применяет command;
5. выполняет все автоматические последствия;
6. пишет semantic events;
7. повышает version один раз;
8. коммитит или откатывает весь переход.

### Conditional

Требует open session, free participant, shortlist book, отсутствия hard/assignment и ненабравшейся книги. Upsert/delete intent и проверка порога выполняются в той же транзакции.

### Hard

Атомарно очищает все conditionals пользователя и прежний hard. Для formed book сразу создаёт assignment; иначе хранит hard и проверяет порог.

### Formation

При `H≥2 && H+C≥3`: idempotent formed marker → assignments всех available H/C → удаление всех intents назначенных людей во всей сессии → автоматическая раскладка книги → события → version bump.

### Admin transfer

Одна команда при необходимости добавляет destination book в глобальный шорт-лист участника, обновляет source assignment, destination assignment/circle, очищает несовместимые intents и пересчитывает затронутые read models. Всё происходит атомарно; session-only назначение вне глобального шорт-листа недопустимо. Размеры кругов не валидируются.

### Close/reopen

Close/reopen проходят через тот же executor. Participant mutations разрешены только в open; admin mutations — в open и closed. Последняя закрытая сессия остаётся current до создания следующей и продолжает защищать связанные hard/assigned книги от удаления из глобального шорт-листа; более старые сессии остаются историей без таких ограничений. Partial unique index остаётся последней защитой от двух одновременно открытых сессий; `23505` преобразуется в `409`.

## Автоматическая раскладка

Для `N≥3`: `k = ceil(N/5)`, assignments сортируются по `assigned_at,user_id`, затем делятся максимально равномерно. Для `N<3` assignments сохраняются без обязательного circle placement. Новое user assignment пересобирает автоматический layout; admin может после этого свободно изменить его.

## Public read model

Книжный DTO должен содержать:

- session/version/lifecycle;
- viewer state и единственный slot;
- participant cards только для viewer shortlist;
- admin cards для union всех session books;
- interest/conditional/hard/assigned participant statuses;
- исторический formed/current viability, text status и все preliminary circles книг viewer shortlist;
- allowed actions, вычисленные сервером;
- `publicRef`/displayName без raw user ID.

Сценарный и книжный state возвращаются в одной версии, но строятся независимыми read-model функциями. Сценарная вкладка во время эксперимента read-only; admin видит все preliminary circles сессии.

## Test and operational obligations

- Unit: participant state machine, `H/C/A` matrix, formed/direct join, N=0..20 partition properties.
- API: 401/403, closed participant/admin split, stale 409, idempotency, one version bump, shortlist guards.
- Concurrency E2E: two books compete for one conditional, hard-vs-catalog deletion, close-vs-mutation, admin-vs-user.
- Persistence E2E: every user/admin action verified after reload.
- UI layout: tabs, pinned card, disappearing actions, 375–390 px, admin controls.
- Migration contract: tables, FK, partial uniques, indexes, lifecycle values, audit triggers, legacy rollout.
- Live initialization: empty session, confirmations only, active/dissolved circles, assignment-confirmation overlap, missing shortlist row, idempotent retry, preflight rollback and concurrent legacy mutation.
- Docs: `docs/features/matching.md`, testing docs, OpenAPI and matching/database/admin/privacy/audit Wiki pages.

## Rollout

1. Add tables, constraints, triggers and read paths without enabling UI.
2. Add commands/DTO/components behind a closed gate.
3. Apply migration through `db-migrate` and verify production schema.
4. Initialize the current session in one audited transition under the session lock: active locked circles → formed books + legacy assignments + preserved circles; remaining confirmations → hard intents; affected books then pass through normal formation rules.
5. Upsert imported books into each affected user's global shortlist, set `book_mode_initialized_at` and bump `state_version` once. Any failed preflight or write rolls back the whole cutover.
6. Make the book tab visible from the committed initialization marker and simultaneously reject legacy scenario mutations; no interval with two writable models is allowed.
7. Run full local matching E2E/layout suite because nightly E2E does not gate merge.
8. Preserve legacy tables as read-only history until the real-session experiment resolves scenario coexistence.

## Product decisions

Подтверждено:

1. Сценарная вкладка read-only во время эксперимента.
2. Книга сохраняет исторический formed после admin override; текущая жизнеспособность показывается отдельно.
3. Последняя закрытая сессия остаётся current до создания следующей и до этого защищает связанные hard/assigned книги. После появления новой current-сессии старые назначения становятся только историей и не блокируют глобальный шорт-лист.
4. Admin assignment вне текущего шорт-листа атомарно добавляет книгу в глобальный шорт-лист. В Matching у пользователя нет книг вне этого списка.
5. Участник видит все предварительные круги книг своего шорт-листа; admin видит все круги.

6. Книжный режим включается посреди текущей legacy-сессии через атомарную инициализацию. Активные locked circles сохраняются как formed/assignment/circle, а остальные confirmations становятся hard intent соответствующей книги; старые таблицы после этого остаются read-only историей.

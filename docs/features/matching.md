# Matching: техническая реализация

Matching использует одну книжную модель. Сценарного представления, переключателя режимов и этапа инициализации больше нет. Сессия создаётся сразу в статусе `open`; после закрытия имеет статус `closed` и может быть снова открыта администратором.

## Книжная доска

Участник видит книги своего актуального глобального шорт-листа. Два намерения хранятся в `matching_book_intents`:

- `conditional` — авто-запись «если соберётся круг»; может стоять на нескольких книгах, но не рядом с твёрдым выбором;
- `hard` — окончательная запись; в текущей модели максимум одна на пользователя, установка очищает его условные согласия.

Книга формируется при двух `hard` и общем числе доступных `hard + conditional` не меньше 3. Эти пороги заданы константами `MIN_FORMATION_HARD_CHOICES = 2` и `MIN_FORMATION_TOTAL_CHOICES = 3`. Назначения хранятся в `matching_book_assignments`, круги — в `matching_circles`, факт первого формирования — в `matching_session_book_states`. Одна книга может иметь несколько кругов; `partitionBookAssignments` детерминированно разбивает назначения на круги по 3–5 человек через `MIN_CIRCLE_SIZE` и `MAX_CIRCLE_SIZE`.

`buildPublicBookModeState` формирует каноническое публичное состояние: книги, счётчики, разрешённые действия, назначения и круги. Внешний ответ использует `publicRef` и `displayName`, а внутренние `userId` участникам не выдаются. `bookMode` в `GET /api/matching/state` обязателен и больше не бывает `null`.

Книжная сессия использует lifecycle `open → closed → open`. В `closed` состояние читается, но пользовательские действия запрещены. Закрытие не удаляет намерения, назначения и круги.

## Поток страницы и UI

`app/matching/page.tsx` показывает:

1. `MatchingWelcome`, если пользователь ещё не вступил в открытую сессию;
2. единую книжную доску `MatchingRealtimeClient` → `MatchingWorkspace` → `MatchingBooksView`.

Перед вступлением `MatchingWelcome` явно сообщает, что настоящее имя пользователя увидят другие участники матчинга. Это раскрытие, добавленное в PR #529, сохраняется без изменений.

Вкладок и сценарной ветки нет ни на desktop, ни на mobile. `MatchingHeader` показывает название, состояние, дедлайн и участников; подписи и редактора размера групп нет. `MatchingBookCard` отображает намерения, назначения и меню авто-записи; подробности открываются через общий `BookDetailProvider`.

Matching использует санкционированный «мягкий дашборд» и только токены из `app/globals.css`: `--shadow-card`, `--radius-card`, `--radius-control`, `--surface-soft`. Геометрию карточек и mobile sheet проверяет `e2e/matching-layout.spec.ts`.

## HTTP и конкурентность

- `GET /api/matching/state?session={id}` — обязательное книжное public state;
- `POST /api/matching/sessions/{id}/book-actions` — `setConditional`, `unsetConditional`, `setHard`, `cancelHard`;
- `POST /api/admin/matching/sessions/{id}/book-admin-actions` — назначения, круги, `closeSession`, `reopenSession`;
- `GET /api/matching/version` — версия, статус и online refs для polling;
- `POST /api/matching/notices/{id}/ack` — подтверждение прочтения notice.

Удалены endpoints подтверждений сценарных кругов, freeze и административный legacy-реестр кругов. Действия `initializeBookMode` больше нет.

Каждая доменная мутация требует `expectedStateVersion`. Несовпадение возвращает `409`; клиент получает актуальное персонализированное состояние. Все операции проходят через `runMatchingTransition` и `withAuditContext`.

`executeMatchingTransition` блокирует строку сессии, проверяет lifecycle, версию и роль участника, применяет книжное действие, пишет `matching_events`/`matching_notices` и увеличивает `state_version`. Beam search, reconciliation подтверждений и каскад legacy-закреплений больше не запускаются. Каталоговые `change_book`, `change_rank`, `change_status` разрешены для исторической `closed`-сессии без изменения её версии, чтобы старые назначения не блокировали обычное редактирование каталога.

## База данных и миграции 0059–0060

Канонические таблицы: `matching_sessions`, `matching_session_participants`, `matching_book_intents`, `matching_book_assignments`, `matching_circles`, `matching_session_book_states`, `matching_events`, `matching_notices`.

Миграция `drizzle/0059_remove_matching_scenarios.sql`:

- валидирует все зафиксированные legacy-круги, сама переносит недостающие круги и участников в `matching_circles` / `matching_book_assignments`, затем проверяет точное совпадение составов в обе стороны;
- конвертирует `active → open`, `frozen → closed`;
- переписывает CHECK и уникальный индекс на статусы `open | closed`;
- удаляет три legacy-таблицы, их audit-триггеры и связанные колонки;
- переписывает DB guard актуальной сессии без `book_mode_initialized_at`.

Миграция `drizzle/0060_remove_matching_group_sizes.sql` удаляет из `matching_sessions` колонки `min_group_size`, `max_group_size` и их CHECK constraint. Таблица остаётся в `AUDITED_TABLES`, существующий audit trigger продолжает работать.

Миграции проекта не применяются к production автоматически. Для PR с фиксированными размерами rollout выполняется в таком порядке:

1. убедиться, что `0059` уже применена, и дождаться production-деплоя PR — новый runtime больше не читает удаляемые колонки;
2. запустить `node scripts/apply-migration.mjs drizzle/0060_remove_matching_group_sizes.sql` с production `DATABASE_URL`;
3. проверить `/matching` и вкладку Matching в админке.

Повторять `0059` не нужно. Запускать `0060` до деплоя нельзя: предыдущая версия приложения выбирает удаляемые колонки.

`AUDITED_TABLES` синхронизирован с оставшимися изменяемыми таблицами. Старые записи в `audit_log` не удаляются.

## История и логи

`matching_events` остаётся смысловым журналом для админской аналитики. Рендерер намеренно понимает старые типы (`confirmation_*`, `circle_dissolved`, `freeze`, `change_group_size`), чтобы ранее записанная история не ломалась. Это не означает наличие соответствующих runtime-действий.

`matching_notices` сохраняется для книжных уведомлений. Старые notices также остаются читаемыми. Presence heartbeat не создаёт бизнес-событий и audit-записей.

## Обязательные ранги

Каждая строка `signup_books` с `personal_status IS NULL` имеет строку `book_priorities`. `rank_source='auto' | 'manual'` различает системный и пользовательский порядок. Инвариант поддерживают `lib/signup-books.ts`, status/priorities routes, `lib/matching/session-transition-db.ts` и `lib/admin/user-merge.ts`; чистая логика находится в `lib/matching/rank-assignment.ts`.

## Проверки

- Unit и API: `lib/matching/__tests__/`, route tests, `components/nd/*Matching*.test.tsx`;
- книжный E2E: `e2e/matching-books.spec.ts`, `e2e/matching-admin.spec.ts`, `e2e/matching-audit.spec.ts` и request-only `e2e/integration/matching/`;
- layout: книжные кейсы в `e2e/matching-layout.spec.ts` для desktop/mobile;
- миграции: контракты `drizzle/0059_remove_matching_scenarios.test.ts`, `drizzle/0060_remove_matching_group_sizes.test.ts`, исполняемые `active` / `frozen` / rollback-сценарии 0059 в `e2e/integration/matching/scenario-removal-migration.spec.ts` и контракт аудита `drizzle/0040_audit_triggers.test.ts`.

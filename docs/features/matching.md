# Matching: техническая реализация

Matching использует одну книжную модель. Сценарного представления, переключателя режимов и этапа инициализации больше нет. Сессия создаётся сразу в статусе `open`; после закрытия имеет статус `closed` и может быть снова открыта администратором.

## Книжная доска

Участник видит книги своего актуального глобального шорт-листа. Два намерения хранятся в `matching_book_intents`:

- `conditional` — авто-запись «если соберётся круг»; может стоять на нескольких книгах, но недоступна, пока у участника есть хотя бы одна окончательная запись;
- `hard` — окончательная запись; может стоять на любом числе книг, установка очищает все условные согласия участника.

Книга формируется при двух `hard` и общем числе `hard + conditional` не меньше 3. Назначение на другую книгу не исключает участника из расчёта. Эти пороги заданы константами `MIN_FORMATION_HARD_CHOICES = 2` и `MIN_FORMATION_TOTAL_CHOICES = 3`. Назначения хранятся в `matching_book_assignments` с ключом `(session_id, user_id, book_id)`, круги — в `matching_circles`, факт первого формирования — в `matching_session_book_states`. Одна книга может иметь несколько кругов; `partitionBookAssignments` детерминированно разбивает назначения на круги по 3–5 человек через `MIN_CIRCLE_SIZE` и `MAX_CIRCLE_SIZE`.

Любое назначение — автоматическое, окончательное или административное — снимает оставшиеся `conditional`-намерения. Если они были, участник получает durable notice со снимками названий книг; то же действие фиксируется отдельным событием `conditional_intents_cleared`. Другие `hard`-записи и назначения сохраняются. Собственное назначение участник снять не может, а `cancelHard` всегда адресован конкретной ещё не сформированной книге.

`buildPublicBookModeState` формирует каноническое публичное состояние: книги, счётчики, разрешённые действия, назначения и круги. Внешний ответ использует `publicRef` и `displayName`, а внутренние `userId` участникам не выдаются. `bookMode` в `GET /api/matching/state` обязателен и больше не бывает `null`.

Книжная сессия использует lifecycle `open → closed → open`. В `closed` состояние читается, но пользовательские действия запрещены. Закрытие не удаляет намерения, назначения и круги.

### Частичное завершение круга

Администратор может отправить отдельный сформированный круг читать через `admin_release_circle`. Участники получают `completed_at` и `completed_circle_id` в `matching_session_participants`, книгу круга — в личный статус `reading`, но назначения, намерения и состав круга не удаляются. Их интересы перестают влиять на счётчики, пороги и разрешённые действия остальных участников (фильтр `isVisibleParticipant` в `buildPublicBookModeState`), но **в админском read model они остаются**: контролы состава (`снять`, выбор круга) адресуют `book.participants`, и без них организатор видел бы человека в круге, не имея способа его тронуть. В админском ответе такой участник помечен `completed: true`, и счётчики карточки его не считают — порог формирования его тоже не учитывает. у самих участников доска становится read-only, а книга круга остаётся сверху. `admin_return_circle` снимает завершённость и возвращает только статус `reading` в shortlist с auto-рангом; статус `read` не меняется. Автоматическая пересборка кругов сохраняет выпущенные круги и создаёт новые только для оставшихся назначений.

Выпущенные участники исключаются из формирования кругов: `formBookIfReady` читает намерения через join с `matching_session_participants` по `completed_at IS NULL`, иначе оставшийся `hard` на другой книге дотягивал её до порога и втягивал вышедшего в новый круг, которого он не видит. Книга круга уходит из ранжированного списка через `detachBookFromPriorities` с уплотнением рангов — как и все остальные пути, убирающие книгу из подбора.

Редкий случай «читаю одну книгу, но хочу выбрать ещё» закрывает `admin_return_participant`: снимает `completed_at` у одного человека, оставляя `completed_circle_id`, круг и `personal_status='reading'` на месте. Дальше работает уже существующее поведение читаемой книги — она в хвосте с меткой «ЧИТАЮ СЕЙЧАС», остальная доска активна. Новых полей и миграций для этого не потребовалось.

Автоматическая пересборка кругов планируется чистой функцией `planCircleRebuild` (`lib/matching/book-partition.ts`): выпущенный круг (его id есть среди `completed_circle_id` участников — признак переживает частичный возврат) сохраняется вместе со своей `position`, остальные пересобираются и нумеруются от максимальной сохранённой позиции. И круги, и назначения на входе ограничены одной книгой — сессионный список сохранённых кругов сдвигал нумерацию у чужих книг (ломая адрес страницы календаря) и мог столкнуться с занятой позицией на уникальном индексе `(session_id, book_id, position)`.

Database guard `guard_current_matching_signup_binding()` продолжает блокировать обычную смену статуса у назначенной книги. Во время `admin_release_circle` transition service выставляет transaction-local marker `app.matching_release_circle=on`; миграция `0063` разрешает только такую административную транзакцию, не ослабляя защиту остальных путей.

## Поток страницы и UI

`app/matching/page.tsx` показывает:

1. `MatchingWelcome`, если пользователь ещё не вступил в открытую сессию;
2. единую книжную доску `MatchingRealtimeClient` → `MatchingWorkspace` → `MatchingBooksView`.

Перед вступлением `MatchingWelcome` явно сообщает, что настоящее имя пользователя увидят другие участники матчинга. Это раскрытие, добавленное в PR #529, сохраняется без изменений.

Вкладок и сценарной ветки нет ни на desktop, ни на mobile. `MatchingHeader` показывает название, состояние, дедлайн и участников; подписи и редактора размера групп нет. После назначения имя участника остаётся обычной подписью «Вы — …», но выход из сессии блокируется. `MatchingBookCard` отображает намерения, назначения и меню авто-записи; карточки других книг остаются активными. Верхняя строка перечисляет все сформированные книги участника. Подробности открываются через общий `BookDetailProvider`.

Диагностика состава — подпись «Состав требует корректировки» (`currentViability === 'needs_attention'`), список «Без круга: …» (`unplacedParticipantRefs`) и акцентный класс `needs-attention` — рендерится **только в `adminMode`**. Участник не может размещать людей в круги, поэтому для него это тревога без средства исправления; неразмещённые назначения к тому же возникают лишь в результате административных действий (автоматика при формировании раскладывает всех). Правило жизнеспособности в `lib/matching/book-public-state.ts` берёт границы из `MIN_CIRCLE_SIZE` / `MAX_CIRCLE_SIZE` (`lib/matching/book-partition.ts`), а не из литералов.

Matching использует санкционированный «мягкий дашборд» и только токены из `app/globals.css`: `--shadow-card`, `--radius-card`, `--radius-control`, `--surface-soft`. Геометрию карточек и mobile sheet проверяет `e2e/matching-layout.spec.ts`.

## HTTP и конкурентность

- `GET /api/matching/state?session={id}` — обязательное книжное public state;
- `POST /api/matching/sessions/{id}/book-actions` — `setConditional`, `unsetConditional`, `setHard`, `cancelHard`;
- `POST /api/admin/matching/sessions/{id}/book-admin-actions` — назначения на конкретную книгу, круги, `closeSession`, `reopenSession`; `unassign` и `place` требуют `bookId`;
- `GET /api/matching/version` — версия, статус и online refs для polling;
- `POST /api/matching/notices/{id}/ack` — подтверждение прочтения notice.

Удалены endpoints подтверждений сценарных кругов, freeze и административный legacy-реестр кругов. Действия `initializeBookMode` больше нет.

Каждая доменная мутация требует `expectedStateVersion`. Несовпадение возвращает `409`; клиент получает актуальное персонализированное состояние. Все операции проходят через `runMatchingTransition` и `withAuditContext`.

`executeMatchingTransition` блокирует строку сессии, проверяет lifecycle, версию и роль участника, применяет книжное действие, пишет `matching_events`/`matching_notices` и увеличивает `state_version`. Beam search, reconciliation подтверждений и каскад legacy-закреплений больше не запускаются. Каталоговые `change_book`, `change_rank`, `change_status` разрешены для исторической `closed`-сессии без изменения её версии, чтобы старые назначения не блокировали обычное редактирование каталога.

## База данных и миграции 0059–0061

Канонические таблицы: `matching_sessions`, `matching_session_participants`, `matching_book_intents`, `matching_book_assignments`, `matching_circles`, `matching_session_book_states`, `matching_events`, `matching_notices`.

Миграция `drizzle/0059_remove_matching_scenarios.sql`:

- валидирует все зафиксированные legacy-круги, сама переносит недостающие круги и участников в `matching_circles` / `matching_book_assignments`, затем проверяет точное совпадение составов в обе стороны;
- конвертирует `active → open`, `frozen → closed`;
- переписывает CHECK и уникальный индекс на статусы `open | closed`;
- удаляет три legacy-таблицы, их audit-триггеры и связанные колонки;
- переписывает DB guard актуальной сессии без `book_mode_initialized_at`.

Миграция `drizzle/0060_remove_matching_group_sizes.sql` удаляет из `matching_sessions` колонки `min_group_size`, `max_group_size` и их CHECK constraint. Таблица остаётся в `AUDITED_TABLES`, существующий audit trigger продолжает работать.

Миграция `drizzle/0061_matching_multibook.sql` снимает частичный уникальный индекс одной `hard`-записи на участника и меняет primary key назначений с `(session_id, user_id)` на `(session_id, user_id, book_id)`. Данные не переписываются и не удаляются. Обе таблицы остаются в `AUDITED_TABLES`; триггер назначений начинает писать book-scoped `entity_id` (`session:user:book`), а прежняя история сохраняется.

Миграции проекта не применяются к production автоматически. Для мультикнижного PR rollout выполняется в таком порядке:

1. убедиться, что `0059` и `0060` уже применены, и дождаться production-деплоя PR;
2. из checkout актуального `main` запустить `node --env-file=.env.local scripts/apply-migration.mjs drizzle/0061_matching_multibook.sql`;
3. проверить `/matching` и вкладку Matching в админке.

Повторять предыдущие миграции не нужно. Между деплоем и ручным запуском `0061` книжная доска автоматически работает только для чтения: read model возвращает `bookMode.mutationsAvailable=false`, а сервер отклоняет книжные мутации контролируемым `409 matching_migration_required`. Close/reopen сессии остаются доступны. После появления нового primary key доска включается автоматически, без отдельного feature flag.

`AUDITED_TABLES` синхронизирован с оставшимися изменяемыми таблицами. Старые записи в `audit_log` не удаляются.

## История и логи

`matching_events` остаётся смысловым журналом для админской аналитики. Рендерер намеренно понимает старые типы (`confirmation_*`, `circle_dissolved`, `freeze`, `change_group_size`), чтобы ранее записанная история не ломалась. Это не означает наличие соответствующих runtime-действий.

`matching_notices` хранит в том числе уведомления `conditional_intents_cleared` со снимками названий снятых авто-записей. Старые notices также остаются читаемыми. Presence heartbeat не создаёт бизнес-событий и audit-записей.

## Обязательные ранги

Каждая строка `signup_books` с `personal_status IS NULL` имеет строку `book_priorities`. `rank_source='auto' | 'manual'` различает системный и пользовательский порядок. Инвариант поддерживают `lib/signup-books.ts`, status/priorities routes, `lib/matching/session-transition-db.ts` и `lib/admin/user-merge.ts`; чистая логика находится в `lib/matching/rank-assignment.ts`.

## Проверки

- Unit и API: `lib/matching/__tests__/`, route tests, `components/nd/*Matching*.test.tsx`;
- книжный E2E: `e2e/matching-books.spec.ts` (в т.ч. `reading` → хвост → метка → `reload()` → «Вернуть в подбор» → основной список → `reload()`), `e2e/matching-admin.spec.ts`, `e2e/matching-audit.spec.ts` и request-only `e2e/integration/matching/`;
- layout: книжные кейсы в `e2e/matching-layout.spec.ts` для desktop/mobile, включая геометрию и текст хвостового разделителя (`matching-tail-divider`) и метку причины `waiting`;
- миграции: контракты `drizzle/0059_remove_matching_scenarios.test.ts`, `drizzle/0060_remove_matching_group_sizes.test.ts`, `drizzle/0061_matching_multibook.test.ts`; исполняемые сценарии 0059 в `e2e/integration/matching/scenario-removal-migration.spec.ts` и смена ключей 0061 в `e2e/integration/matching/multibook-migration.spec.ts`; контракт аудита `drizzle/0040_audit_triggers.test.ts`.

## Хвостовой раздел: «Записаться пока нельзя»

Раздел объединяет две причины, по которым книга временно недоступна для записи, — оба случая рендерятся общим разделителем `data-testid="matching-tail-divider"` (issue #560; до переименования — `matching-viewer-only-divider`, обозначавший только первый случай):

1. **`waiting`** — книгу пока выбрал только текущий участник, ни у кого больше нет интереса, авто-записи, окончательной записи или назначения на неё;
2. **`reading`** — `signup_books.personal_status = 'reading'` у вьюера на этой книге. Такая книга уезжает в хвост **всегда**, даже если её выбрали другие участники, у неё уже есть круг или назначение — `viewerPersonalStatus: 'reading'` перекрывает обычную сортировку. Статус `read` не обрабатывается: прочитанную книгу не имеет смысла возвращать в подбор.

Заголовок раздела: «Записаться пока нельзя». Подзаголовок: «Эти книги остаются в вашем списке, но в подборе не участвуют.» — формулировка одна на оба случая, поэтому не может соврать, в отличие от прежнего «Пока только в вашем списке» + «Когда кто-то ещё выберет эти книги, на них можно будет записаться» (ложь для `reading`-книг, которые вполне могли выбрать и другие).

На каждой карточке хвоста — микрометка причины `data-testid="matching-book-tail-reason"` с атрибутом `data-reason="waiting" | "reading"`:

- `waiting` → «ЖДЁМ ДРУГИХ» + «Когда кто-то ещё выберет — можно будет записаться»;
- `reading` → «ЧИТАЮ СЕЙЧАС» + «Пока читаете, книга не участвует в подборе» + кнопка `data-testid="matching-return-to-matching"` («Вернуть в подбор», в процессе — «Возвращаем…»).

Кнопка не заводит отдельную ручку: она вызывает уже существующий `PATCH /api/signup-books/[bookId]/status` с `{ status: null }`, который снимает `personal_status`, выдаёт auto-ранг (`nextRank`) и рассылает `broadcastActiveMatchingStateChangeForParticipant`; клиент после `{ ok: true }` дёргает обычный `onRefresh()` `MatchingBooksView`.

Сортировка хвоста — третья ступень `decisionScore` в `lib/matching/book-public-state.ts` (`tailRank`, ранее `viewerOnlyTail`): `0` — книга не в хвосте, `1` — `waiting`, `2` — `reading`. Внутри хвоста `waiting`-книги идут раньше `reading`-книг.

На обеих карточках хвоста нет кнопки записи и меню авто-записи (`allowedActions` для `reading`-книги — все `false`); подробности книги остаются доступны. Для `waiting`-книг кнопка записи появляется сразу, как только у книги возникает хотя бы один другой участник с интересом, авто-записью, окончательной записью или назначением; если последнее пересечение исчезло, ранее сделанная запись сохраняется вместе с доступной отменой, а для авто-записи — отдельной кнопкой «Отменить авто-запись». Правила формирования кругов и серверные действия не меняются.

`visibleBookIds` для не-админа теперь включает `viewerReadingBookIds` (`lib/matching/public-state-db.ts`) в дополнение к обычным интересам — иначе `reading`-книга не попадала бы в ответ вовсе. Побочный эффект: при **закрытой** сессии локи сняты (`shouldEnforceCatalogMatchingLocks` → `sessionStatus !== 'closed'`), и раньше участник, уже назначенный в круг, мог поставить книге «читаю» и потерять её с доски целиком вместе с кругом — книга просто переставала быть видимой. Теперь `reading`-книга остаётся в `visibleBookIds` и по-прежнему показывает участнику его круг, только в хвостовом разделе без кнопок.

Серверные гарантии не меняются: `requireShortlistBook` (`lib/matching/book-transition-db.ts`) продолжает отклонять книжные мутации кодом `book_not_in_shortlist` независимо от UI — это второй, независимый от разметки слой защиты.

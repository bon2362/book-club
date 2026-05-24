# План рефакторинга каталога книг

Дата: 2026-05-23
Актуализировано: 2026-05-24

Статус: финальный cleanup выполняется в ветке `codex/finish-books-catalog-cleanup`; production migration `0024_drop_legacy_book_name.sql` применена.

## Контекст

До рефакторинга книга не была самостоятельной доменной сущностью в базе данных.

Каталог собирался из нескольких источников:

- Google Sheets (`lib/sheets.ts`) — основной список книг;
- `book_submissions` — пользовательские предложения книг;
- `book_statuses` — ручный статус `reading` / `read`;
- `book_new_flags` — ручной override бейджа `NEW`;
- `signup_books.book_name` — записи пользователей на книги по названию;
- `book_priorities.book_name` — пользовательские приоритеты по названию.

Главная проблема была в том, что связи пользователей с книгами хранились через название книги, а не через стабильный id. Поэтому переименование книги требовало каскадно переписывать `signup_books` и `book_priorities`, а книги из Google Sheets имели id вида `2`, `38`, где id фактически равен номеру строки в листе. Это хрупко: при изменении порядка строк связь могла стать неверной.

Цель рефакторинга — полностью перенести управление каталогом книг на сайт и отказаться от Google Sheets как источника книг.

## Продуктовое решение

- Все книги хранятся в новой таблице `books`.
- Администратор управляет книгами на сайте, в новой вкладке админки.
- Новые книги, созданные администратором вручную, по умолчанию скрыты из публичного каталога.
- Когда администратор переключает книгу в `published`, она появляется в каталоге.
- Пользовательские предложения книг остаются отдельным moderation flow.
- Когда администратор одобряет пользовательскую заявку, книга автоматически создаётся в `books` и сразу публикуется, как сейчас.
- Поля книги должны редактироваться полностью: название, автор, тема/теги, тип, размер, страницы, дата публикации, ссылка на текст, описание, обложка, объяснение “зачем читать”, рекомендационная ссылка, статусы и публикация.
- `reading` / `read` остаются по смыслу как сейчас.
- `published` / `hidden` — отдельное измерение видимости в каталоге.

## Целевая модель данных

### `books`

Новая основная таблица каталога.

Поля:

- `id` — UUID, primary key;
- `canonical_key` — nullable stable key для дедупликации и админского поиска;
- `title` — название книги;
- `author` — автор;
- `tags` — `jsonb` массив строк;
- `type` — lowercase значение: `book` / `article`;
- `size` — размер, как сейчас в Sheets;
- `pages` — число страниц, nullable;
- `published_date` — text display value из текущих данных, не timestamp;
- `text_url` — ссылка на текст;
- `description` — описание;
- `cover_url` — ссылка на обложку;
- `why_read` — почему стоит читать в клубе;
- `recommendation_link` — ссылка на рекомендацию;
- `reading_status` — nullable enum-like text: `reading` / `read`;
- `visibility` — enum-like text: `hidden` / `published`;
- `is_new` — boolean;
- `sort_order` или `published_order` — явный порядок публичного каталога;
- `source` — `admin`, `submission`, `sheets_import`;
- `source_submission_id` — nullable FK на `book_submissions.id`;
- `legacy_sheets_row_id` — nullable text для аудита миграции;
- `created_at`;
- `updated_at`;
- `published_at`;
- `hidden_at`.
- `archived_at` — nullable soft delete marker.

Разрешённые значения:

- `visibility`: `hidden`, `published`;
- `reading_status`: `null`, `reading`, `read`;
- `source`: `admin`, `submission`, `sheets_import`;
- `type`: `book`, `article`.

UI показывает русские подписи поверх этих lowercase значений.

Валидация:

- на уровне API принимать только разрешённые значения;
- на уровне БД желательно добавить check constraints для `visibility`, `reading_status`, `source`, `type`;
- неожиданные `type` из старых данных должны попадать в audit report, а не молча записываться в `books`.

Индексы:

- `books_visibility_idx` на `visibility`;
- `books_source_submission_id_idx` на `source_submission_id`;
- unique partial index на `source_submission_id where source_submission_id is not null`, чтобы повторный backfill одной заявки не создавал дубль;
- `books_canonical_key_idx` на `canonical_key`;
- `books_sort_order_idx` на `sort_order`, если используется отдельное поле порядка.

Правила:

- публичный каталог показывает только `visibility = 'published'`;
- публичный каталог не показывает книги с `archived_at is not null`;
- админка показывает все неархивные книги и может иметь отдельный фильтр архива;
- `reading_status` не влияет на видимость;
- `is_new` заменяет `book_new_flags`;
- `reading_status` заменяет `book_statuses`;
- порядок каталога задаётся явно через `sort_order` или `published_order`; порядок из Google Sheets не должен оставаться неявной зависимостью.

### `legacy_book_mappings`

Временная миграционная таблица или обязательный audit report для безопасного переноса старых ссылок.

Поля:

- `legacy_source` — `sheets`, `submission`, `book_name`;
- `legacy_id` — row id из Sheets, `book_submissions.id` или normalized legacy title;
- `legacy_title`;
- `legacy_author`;
- `book_id`;
- `confidence` — `exact`, `normalized`, `manual`, `unmatched`;
- `resolution` — пояснение, почему выбран этот `book_id`;
- `created_at`.

Зачем нужна:

- `book_statuses.book_id` и `book_new_flags.book_id` могут ссылаться на Google Sheets row id или submission id;
- `signup_books.book_name` и `book_priorities.book_name` ссылаются на название;
- title matching без явного mapping может тихо привязать пользователя к неверной книге.

Правило:

- финальный backfill `signup_books.book_id` и `book_priorities.book_id` идёт через `legacy_book_mappings`, а не через прямое сравнение `books.title`;
- строки с `confidence = 'unmatched'` блокируют удаление legacy `book_name`.

### Что не возвращаем в новую модель

`book_covers` не должна возвращаться.

Исторически `book_covers` была кешем внешних обложек. Сейчас обложка хранится прямо рядом с данными книги:

- до миграции — `coverUrl` из Google Sheets или `book_submissions.cover_url`;
- после миграции — `books.cover_url`.

Правило:

- не создавать новую `book_covers`;
- не восстанавливать Google Books API / внешний кеш обложек;
- при финальной чистке проверить, что в runtime-коде нет `book_covers` / `bookCovers`;
- если таблица физически осталась в какой-либо Neon branch, удалить её отдельной безопасной миграцией `DROP TABLE IF EXISTS book_covers`.

### `signup_books`

Целевая версия:

- `user_id`;
- `book_id`;
- `signed_at`.

Primary key:

- `(user_id, book_id)`.

Legacy `book_name` должен быть удалён после миграции и периода совместимости.

### `book_priorities`

Целевая версия:

- `user_id`;
- `book_id`;
- `rank`;
- `updated_at`.

Primary key:

- `(user_id, book_id)`.

Legacy `book_name` должен быть удалён после миграции и периода совместимости.

### `book_submissions`

Таблица остаётся как история и moderation queue, но перестаёт быть вторым источником опубликованного каталога.

Добавить:

- `book_id` — nullable FK на `books.id`, заполняется при approval;

Правила:

- `pending` / `rejected` живут только в `book_submissions`;
- при `approved` создаётся или обновляется `books` row;
- одобренная заявка больше не добавляется в каталог напрямую через `fetchBooksWithCovers`;
- если админ редактирует одобренную заявку после approval, надо определить источник истины:
  - предпочтительно: редактировать опубликованную книгу в `books`;
  - `book_submissions` хранит исходное предложение и статус модерации.

## Миграционная стратегия

Главное требование: не потерять данные о книгах, записях пользователей и приоритетах.

Миграцию нужно выполнять в несколько PR, с промежуточным dual-read / dual-write периодом.

## Текущее состояние после PR #146

Выполнено и смержено в `main`:

- Этап 0: аудит данных и snapshot каталога — DONE in PR #141.
  - Добавлены `scripts/books-catalog-audit.ts`, `data/books-catalog-snapshot.json`, `docs/planning-artifacts/books-catalog-migration-audit.md`.
  - На момент аудита: 45 книг, 83 legacy mappings, 0 unmatched.
- Этап 1: базовая схема и backfill — DONE in PR #141.
  - Добавлены `books`, `legacy_book_mappings`.
  - Добавлены nullable `book_id` в `book_submissions`, `signup_books`, `book_priorities`.
  - Миграция `0021_books_catalog.sql` применена к production.
  - Production verification показывала заполненные `book_id` для существующих signup/priorities.
- Этап 2: чтение каталога из БД — DONE in PR #141.
  - Добавлен `lib/books.ts`.
  - Главная, админка и `/api/books` читают каталог из `books`.
  - `lib/books-with-covers.ts` оставлен как compatibility shim.
  - Runtime больше не собирает каталог из Google Sheets + approved submissions.
- Этап 3: пользовательские связи переведены на `book_id` — DONE in PR #142 and finalized in PR #146.
  - UI передаёт `selectedBookIds` / `bookIds`.
  - `/api/signup`, `/api/priorities`, `/api/admin/priorities`, admin drawer/actions работают по `book_id`.
  - Legacy fallback по `selectedBooks` / title-based priorities удалён.
  - `signup_books` и `book_priorities` имеют PK `(user_id, book_id)`.
  - Миграция `0023_books_catalog_relax_book_name.sql` применена к production: `book_id` стал `NOT NULL`, `book_name` стал nullable и оставлен только на один rollout window.
  - Drizzle schema больше не описывает `signup_books.book_name` / `book_priorities.book_name`.
  - `/api/admin/rename-book` удалён, cascade rename по title больше не нужен.
- Этап 4: админская вкладка каталога — DONE in PR #143.
  - Добавлена вкладка `Каталог` в админке.
  - Реализованы поиск, фильтры, создание hidden книги, редактирование полей, publish/hide, archive/restore.
  - Добавлены `GET/POST /api/admin/books`, `PATCH /api/admin/books/[id]`.
  - Добавлены `createBook`, `updateBook`, `BookValidationError`.
  - Добавлены unit-тесты и E2E `e2e/admin-books-catalog.spec.ts`.
- Этап 5: approval flow заявок переведён на `books` — DONE in PR #141, cleaned in PR #146.
  - Добавлен `lib/book-publish.ts`.
  - При approval создаётся/синхронизируется `books` row.
  - `book_submissions.book_id` связывает заявку с опубликованной книгой.
  - Автор заявки записывается на книгу через `book_id`.
  - Rename approved submission больше не делает update пользовательских связей по title.
- Этап 6: Google Sheets удалён из runtime каталога — DONE in PR #144.
  - `/api/og` читает книги из БД.
  - `/api/sync` удалён.
  - Кнопка Sync удалена из админки.
  - `GOOGLE_SHEETS_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY` стали optional.
  - `lib/sheets.ts` оставлен только как deprecated helper для исторического audit script.
  - Runtime каталога и деплой больше не зависят от Google Sheets API.
- Этап 7, phase 1: legacy `book_statuses` и `book_new_flags` удалены из runtime/schema/production — DONE in PR #141.
  - Миграция `0022_drop_book_statuses_flags.sql` применена к production.
  - Compatibility routes `/api/admin/book-status` и `/api/admin/book-new-flag` больше не нужны после перевода AdminPanel на `PATCH /api/admin/books/:id`.
- Этап 7, phase 2 частично выполнен — PARTIAL in PR #146.
  - Runtime больше не пишет `book_name`.
  - Drizzle schema больше не содержит `book_name` в `signup_books` / `book_priorities`.
  - Физические production-колонки `book_name` пока оставлены nullable для безопасного rollout.
  - Следующая миграция должна быть `0024_drop_legacy_book_name.sql` или аналогичная финальная cleanup migration.
- E2E fixture cleanup исправлен после ревью.
  - Тестовые книги вынесены в `/api/test/seed-books`.
  - Фикстуры удаляются в global teardown.
  - Проверка после локального E2E: `__test_book_*` в production DB отсутствуют.

Осталось сделать перед merge текущего cleanup PR:

- Этап 7, phase 2: удалить физические legacy поля после production soak — DONE in cleanup branch / migration applied to production.
  - `signup_books.book_name`;
  - `book_priorities.book_name`;
  - `book_covers`;
  - production verification after migration: columns/tables absent, `signup_books=65`, `book_priorities=46`.
- Этап 7, phase 3: финально дочистить legacy mentions — DONE in cleanup branch.
  - `scripts/cleanup-test-books.ts` переведён на `book_id`.
  - `scripts/generate-books-migration.ts` и `scripts/books-catalog-audit.ts` помечены как deprecated one-shot scripts.
  - docs/testing/AGENTS/CLAUDE обновлены под DB fixtures.
- Этапы 8-9: отдельно убрать legacy `session` и `account` таблицы после auth-аудита.
- Этап 10: финальная чистка docs/tests/feature docs.

Важно:

- PR #144 был смержен после дополнительных правок; последний видимый run на PR мог быть красным, но Stage 6 уже находится в `main`. Перед следующими merge ориентироваться на CI текущей ветки/main, а не на старый PR run.
- Следующий DB cleanup PR должен начинаться с production verification:
  - `select count(*) from signup_books where book_id is null`;
  - `select count(*) from book_priorities where book_id is null`;
  - `select count(*) from signup_books where book_name is not null`;
  - `select count(*) from book_priorities where book_name is not null`;
  - проверка отсутствия `__test_book_*`;
  - проверка, что `book_statuses` / `book_new_flags` физически отсутствуют или больше не используются.

## Этап 0. Аудит данных перед миграцией — DONE

Цель: понять текущее состояние данных и подготовить безопасную карту соответствий.

Сделать скрипт аудита, который выгружает:

- все книги из Google Sheets с текущими row id;
- все `book_submissions`;
- все `book_statuses`;
- все `book_new_flags`;
- все `signup_books`;
- все `book_priorities`;
- строки `signup_books.book_name`, которых нет в текущем каталоге;
- строки `book_priorities.book_name`, которых нет в текущем каталоге;
- дубли книг по normalized title + author;
- одобренные заявки, которые совпадают с книгами из Sheets по title/author.
- candidate mapping для всех legacy ссылок:
  - `book_statuses.book_id`;
  - `book_new_flags.book_id`;
  - `signup_books.book_name`;
  - `book_priorities.book_name`;
  - approved `book_submissions.id`.

Артефакт:

- `docs/planning-artifacts/books-catalog-migration-audit.md` или generated report в `output/`.

Критерий готовности:

- есть список всех конфликтов;
- понятна стратегия сопоставления legacy ids/title -> `books.id`;
- есть draft `legacy_book_mappings` с confidence/resolution;
- нет неизвестных записей, которые silently потеряются.

## Этап 1. Создать `books` без переключения runtime — DONE

Цель: добавить новую таблицу без изменения поведения сайта.

Задачи:

- добавить `books` в `lib/db/schema.ts`;
- добавить `book_submissions.book_id`;
- добавить nullable `book_id` в `signup_books`;
- добавить nullable `book_id` в `book_priorities`;
- добавить временную `legacy_book_mappings` или зафиксировать generated mapping report как обязательный input для backfill;
- сгенерировать Drizzle migration;
- написать idempotent migration/backfill script:
  - импортирует все текущие книги из Google Sheets в `books`;
  - переносит `book_statuses.status` в `books.reading_status`;
  - переносит `book_new_flags.is_new` в `books.is_new`;
  - создаёт `books` rows для approved `book_submissions`, если их ещё нет;
  - связывает approved `book_submissions.book_id` с созданной книгой;
  - сохраняет `legacy_sheets_row_id` для книг из Sheets;
  - заполняет `legacy_book_mappings`;
  - заполняет `signup_books.book_id` через mapping;
  - заполняет `book_priorities.book_id` через mapping.

Правила импорта:

- книги из Sheets получают `source = 'sheets_import'`;
- книги из approved submissions получают `source = 'submission'`;
- `type` нормализуется в lowercase: `Book` -> `book`, `Article` -> `article`;
- `tags` сохраняются как `jsonb` массив строк;
- `published_date` остаётся text display field;
- `canonical_key` строится из normalized title + author и используется для аудита/поиска, но не запрещает дубли;
- книги из Sheets импортируются с `visibility = 'published'`;
- approved submissions импортируются с `visibility = 'published'`;
- вручную созданные позже книги будут получать `source = 'admin'` и `visibility = 'hidden'`;
- если у sheets-книги есть `book_new_flags`, значение переносится в `books.is_new`;
- если у sheets-книги есть `book_statuses`, значение переносится в `books.reading_status`.
- `sort_order` / `published_order` восстанавливает текущий порядок каталога:
  - approved submissions сохраняют порядок “сверху” как сейчас;
  - sheets-книги сохраняют текущий reverse order из `fetchBooksWithCovers`.
- дубли книг разрешены; администратор отвечает за то, чтобы не одобрять дубли. Audit всё равно показывает потенциальные дубли как предупреждение.

Критерий готовности:

- таблица создана;
- backfill можно запускать повторно без дублей;
- количество опубликованных книг в `books` совпадает с текущим публичным каталогом;
- все возможные `signup_books.book_id` и `book_priorities.book_id` заполнены;
- unmatched legacy rows явно перечислены и не скрыты;
- порядок каталога после чтения из `books` будет совпадать с текущим;
- ручная проверка показывает, что книги с legacy id `2` и `38` перенеслись корректно:
  - `2` -> “Революционный темперамент. Париж в 1748–1789 годах”;
  - `38` -> “Жизнь и времена либеральной”.

## Этап 2. Перевести чтение каталога на `books` — DONE

Цель: публичный сайт и админка читают каталог из БД, но legacy связи по `book_name` ещё работают.

Задачи:

- создать `lib/books.ts` или заменить `lib/books-with-covers.ts` на DB-backed implementation;
- публичный каталог читает только `books.visibility = 'published'`;
- админка получает все книги для будущей вкладки управления;
- сохранить совместимый `BookWithCover` shape для UI на переходный период;
- `app/api/books/route.ts` читает из `books`;
- `app/page.tsx` перестаёт читать `bookStatuses`;
- `app/admin/page.tsx` перестаёт читать `bookStatuses` и `bookNewFlags` как отдельные таблицы;
- `book_status` и `is_new` берутся из `books`.

Временно:

- `signupCount` считается по `signup_books.book_id`; fallback по `book_name` допустим только через `legacy_book_mappings`, не через прямое сравнение title;
- текущие пользовательские записи продолжают работать;
- Google Sheets код остаётся в проекте только для backfill/fallback до завершения миграции.

Критерий готовности:

- публичный каталог визуально совпадает с прежним;
- админка показывает те же книги, статусы и `NEW`;
- тесты покрывают чтение из `books`;
- Google Sheets не участвует в runtime чтении каталога.

## Этап 3. Переключить пользовательские связи на `book_id` — DONE

Цель: runtime перестаёт опираться на связь “пользователь -> название книги”.

Задачи:

- проверить результат backfill из Этапа 1:
  - для каждой `signup_books.book_name` есть `signup_books.book_id` или явная unmatched запись;
  - для каждой `book_priorities.book_name` есть `book_priorities.book_id` или явная unmatched запись;
  - не удалять legacy поля до полной проверки;
- обновить API записи на книги:
  - client передаёт `bookId`;
  - server валидирует, что книга существует и опубликована или доступна админу;
  - `upsertSignup` пишет `book_id`;
- обновить API приоритетов:
  - client передаёт список `bookId`;
  - `book_priorities` пишет `book_id`;
- обновить админские actions:
  - снять пользователя с книги по `bookId`;
  - получить приоритеты по `bookId`;
  - больше не выполнять rename cascade по `book_name`.

Переходная совместимость:

- на время PR можно читать `book_id ?? mapLegacyBookName(book_name)`;
- запись новых данных должна идти в `book_id`;
- legacy `book_name` можно продолжать заполнять как cache только до финальной уборки.

Критерий готовности:

- все существующие `signup_books` имеют `book_id`;
- все существующие `book_priorities` имеют `book_id`;
- нет unmatched записей без ручного решения;
- выбор книг и приоритеты сохраняются после reload;
- переименование книги больше не требует обновлять пользовательские связи.

Фактически выполнено:

- PR #142 перевёл UI/API на передачу `book_id` с переходной совместимостью.
- PR #146 сделал `book_id` обязательным серверным контрактом и убрал title-based fallback.
- `0023_books_catalog_relax_book_name.sql` применена к production.
- `book_name` больше не пишется runtime-кодом и не описан в Drizzle schema.

Остаток относится уже к Этапу 7: физически удалить nullable legacy columns `book_name` из production DB.

## Этап 4. Админская вкладка “Книги” — DONE

Цель: управление каталогом полностью на сайте.

Задачи UI:

- добавить новую вкладку в админке: `Книги`;
- список книг:
  - поиск;
  - фильтр `published` / `hidden`;
  - фильтр `reading` / `read` / без статуса;
  - бейдж источника: `admin`, `submission`, `sheets_import`;
  - количество записавшихся;
  - дата обновления;
- форма создания книги:
  - все поля книги;
  - default `visibility = hidden`;
  - default `is_new = false`;
- форма редактирования книги:
  - все поля книги;
  - toggles для `published` / `hidden`, `is_new`, `reading_status`;
- удаление:
  - только soft delete через `archived_at`;
  - `hidden` означает “не показывать в каталоге”, но книга остаётся активной административной сущностью;
  - физическое удаление не делать в обычном UI, потому что даже hidden/archived книга может иметь историю signup/priorities.

Задачи API:

- `GET /api/admin/books`;
- `POST /api/admin/books`;
- `PATCH /api/admin/books/:id`;
- опционально `DELETE /api/admin/books/:id` только для безопасного случая;
- вместо обычного `DELETE` предпочтителен `PATCH archivedAt`;
- валидация admin session;
- серверная нормализация tags/pages/urls.

Критерий готовности:

- админ может вручную создать hidden книгу;
- после переключения в published книга появляется в публичном каталоге;
- после переключения в hidden книга пропадает из публичного каталога, но остаётся в админке;
- все поля редактируются;
- изменения сохраняются после reload.

Фактически выполнено:

- PR #143 добавил вкладку `Каталог` в админке.
- Реализованы CRUD/edit/publish/hide/archive/restore.
- Добавлены admin API routes и unit/e2e покрытие.

## Этап 5. Перевести approval flow заявок на `books` — DONE

Цель: `book_submissions` перестаёт быть источником книг в каталоге.

Задачи:

- при `PATCH /api/admin/submissions/:id` со `status = approved`:
  - создать `books` row из полей заявки;
  - `visibility = 'published'`;
  - `source = 'submission'`;
  - `source_submission_id = submission.id`;
  - записать `book_submissions.book_id`;
  - автоматически записать автора заявки на созданную книгу через `signup_books.book_id`;
- если approved submission уже имеет `book_id`, не создавать дубль для этой же заявки;
- если approved submission похожа на существующую книгу, всё равно создать отдельную книгу: дубли разрешены, администратор отвечает за модерацию дублей до approval;
- после approval редактирование опубликованной книги должно идти через вкладку `Книги`;
- email-уведомление остаётся как сейчас.

Решение по старым approved submissions:

- они должны иметь `book_id` после backfill;
- каталог не должен читать approved submissions напрямую.

Критерий готовности:

- новая предложенная книга после approval появляется в каталоге;
- пользователь, предложивший книгу, записан на неё через `book_id`;
- повторный approval не создаёт дублей;
- изменение title книги не ломает signup/priorities.

## Этап 6. Удалить runtime-зависимость от Google Sheets — DONE

Цель: полностью убрать Google Sheets из каталога книг.

Задачи:

- удалить runtime imports `fetchBooks`, `fetchBooksWithCovers` из страниц и API;
- удалить или заархивировать `lib/sheets.ts`, если он больше нигде не нужен;
- удалить `GOOGLE_SHEETS_ID` и `GOOGLE_SERVICE_ACCOUNT_KEY` из обязательных env для runtime, если они не используются другими фичами;
- обновить `docs/features/books-catalog.md`;
- обновить `docs/features/infra.md`;
- обновить `AGENTS.md` / проектные инструкции, где говорится, что обложки берутся из колонки N Google Sheets;
- удалить `/api` или admin sync actions, которые обновляли Sheets cache;
- убрать `SHEETS_CACHE_TAG` и `revalidateTag` логику для книг.

Критерий готовности:

- сайт работает без Google Sheets env vars;
- каталог полностью управляется через DB/admin UI;
- деплой не зависит от Google Sheets API.

Фактически выполнено:

- PR #144 удалил `/api/sync` и кнопку Sync.
- `/api/og` переведён на DB-backed `fetchBooksWithCovers`.
- Google Sheets env vars стали optional.
- `lib/sheets.ts` оставлен только как deprecated historical audit helper, не runtime dependency.

## Этап 7. Удалить legacy таблицы и поля — PARTIAL

Цель: убрать дублирующие сущности после стабильной работы новой модели.

Удалить:

- `book_statuses` — DONE;
- `book_new_flags` — DONE;
- `signup_books.book_name` — DONE, dropped in production by `0024_drop_legacy_book_name.sql`;
- `book_priorities.book_name` — DONE, dropped in production by `0024_drop_legacy_book_name.sql`;
- legacy API:
  - `/api/admin/book-status` — DONE, deleted in cleanup branch;
  - `/api/admin/book-new-flag` — DONE, deleted in cleanup branch;
  - `/api/admin/rename-book` — DONE, deleted in PR #146;
- код каскадного переименования в submission/admin routes — DONE;
- любые helper-и, которые ищут книгу по названию как primary mechanism — DONE for runtime, TODO for historical scripts/docs cleanup.

Оставить:

- `book_submissions` как историю предложений и moderation queue;
- `book_submissions.book_id` как связь заявки с опубликованной книгой.

Критерий готовности:

- `rg "bookName|book_name|bookStatuses|bookNewFlags|book_covers|bookCovers|fetchBooks|Google Sheets"` не находит runtime legacy usage, кроме исторических docs/tests где это явно ожидаемо;
- схема БД не содержит legacy таблиц/полей;
- тесты и e2e проходят;
- production работает после миграции.

Фактически выполнено:

- создана и применена финальная миграция `0024_drop_legacy_book_name.sql`:
  - guard: `signup_books.book_id is null = 0`;
  - guard: `book_priorities.book_id is null = 0`;
  - `ALTER TABLE signup_books DROP COLUMN IF EXISTS book_name`;
  - `ALTER TABLE book_priorities DROP COLUMN IF EXISTS book_name`;
  - `DROP TABLE IF EXISTS book_covers`;
- compatibility routes `/api/admin/book-status` и `/api/admin/book-new-flag` удалены после перевода старых обработчиков AdminPanel на `PATCH /api/admin/books/:id`;
- fallback по `book_name` из `scripts/cleanup-test-books.ts` удалён;
- устаревшие one-shot migration scripts помечены как deprecated.

## Этап 8. Удалить legacy `session` table — TODO

Цель: убрать неиспользуемую таблицу `session` из схемы и базы.

Текущее состояние:

- NextAuth настроен с `session: { strategy: 'jwt' }`;
- активные пользовательские сессии живут в JWT cookie, а не в таблице `session`;
- таблица `session` остаётся в Drizzle schema из-за Auth.js adapter legacy и исторической совместимости;
- test endpoints сейчас могут проверять или чистить `sessions`.

План:

- подтвердить в production, что `session` пуста или не используется:
  - `select count(*) from "session";`
  - проверить отсутствие runtime insert/update/delete в `session`;
- обновить `IdentityAwareDrizzleAdapter`:
  - убедиться, что JWT strategy не требует `sessionsTable`;
  - если DrizzleAdapter требует schema object с `sessionsTable`, заменить adapter на минимальный кастомный adapter без session methods или оставить stub только до удаления `account`;
- удалить `sessions` из `lib/db/schema.ts`;
- обновить `/api/test/session`, `/api/test/user` и тесты, чтобы они не ожидали rows в `session`;
- сгенерировать миграцию `DROP TABLE IF EXISTS "session"`;
- обновить docs, где перечисляется `sessions`.

Критерий готовности:

- auth flows работают после удаления таблицы;
- `/api/auth/session` возвращает корректную JWT session;
- Google OAuth, Google One Tap, Telegram preauth и magic link проходят smoke/e2e;
- `rg "sessions|sessionTable|sessionsTable"` не находит runtime-зависимости от DB session table.

## Этап 9. Удалить legacy `account` table — TODO

Цель: сделать `user_identities` единственным источником внешних auth identity и убрать техническую таблицу Auth.js `account`.

Текущее состояние:

- `account` пока ещё нужна для совместимости Google OAuth + DrizzleAdapter;
- Google OAuth/One Tap синхронизируются в `user_identities`, но часть adapter flow всё ещё может читать `account`;
- Telegram и email identities уже не должны зависеть от `account`;
- удалять `account` до переключения adapter нельзя, иначе возможны `OAuthAccountNotLinked` и дубли пользователей.

План:

- провести аудит:
  - все Google `account` rows имеют соответствующую `user_identities(provider='google')`;
  - нет расхождений `account.userId != user_identities.user_id` для одного provider account id;
  - нет Google users без `user_identities`;
- доработать `IdentityAwareDrizzleAdapter`:
  - `getUserByAccount` читает только `user_identities`;
  - `linkAccount` создаёт/обновляет `user_identities`, а не `account`;
  - `unlinkAccount`, если нужен, работает через `user_identities`;
  - `createUser`, `getUser`, `getUserByEmail`, `updateUser` остаются на `users`;
  - verification token flow для magic link остаётся через `verificationToken`, если Auth.js требует adapter method;
- обновить Google One Tap:
  - не вставлять `accounts`;
  - создавать/обновлять только `users` + `user_identities`;
- удалить импорты `accounts` из runtime helpers, кроме миграционных скриптов;
- обновить тесты auth adapter и auth callbacks;
- после production soak удалить `accounts` из `lib/db/schema.ts`;
- сгенерировать миграцию `DROP TABLE IF EXISTS "account"`;
- обновить docs, где `account` описывается как активная таблица.

Критерий готовности:

- Google OAuth не создаёт дубликат пользователя при повторном входе;
- Google One Tap и Google OAuth используют один и тот же `user_identities` row;
- magic link не зависит от `account`;
- Telegram не зависит от `account`;
- `rg "accounts|accountTable|accountsTable|from\\(accounts\\)|insert\\(accounts\\)"` не находит runtime usage;
- таблица `account` удалена из production DB.

## Этап 10. Финальная чистка тестов и документации — TODO

Задачи:

- обновить unit tests — PARTIAL/DONE for delivered stages:
  - books repository;
  - signup/priorities by `book_id`;
  - submission approval -> book creation;
  - admin books API;
- обновить e2e — PARTIAL/DONE for delivered stages:
  - пользователь выбирает книгу и reload подтверждает запись;
  - пользователь расставляет приоритеты и reload подтверждает порядок;
  - админ создаёт hidden книгу;
  - админ публикует книгу, и она появляется в каталоге;
  - админ скрывает книгу, и она пропадает из каталога;
  - пользователь предлагает книгу, админ одобряет, книга публикуется — TODO verify current coverage;
- обновить feature docs — PARTIAL:
  - `docs/features/books-catalog.md`;
  - `docs/features/admin-panel.md`;
  - `docs/features/infra.md`;
  - `docs/features/auth.md`;
  - `docs/features/user-profile.md`;
- обновить seed/test fixtures, чтобы они использовали `books`;
- проверить, что `NEXTAUTH_TEST_MODE` больше не подмешивает тестовые книги через Sheets layer.
- обновить ERD/DB docs:
  - `books` есть как реальная таблица;
  - `BOOK_CATALOG` как логическая сущность удалён из документации;
  - `book_covers`, `session`, `account`, `book_statuses`, `book_new_flags` не описываются как активные таблицы.

Текущий остаток по документации:

- historical migration/audit scripts оставлены как deprecated one-shot scripts, чтобы сохранить историю миграции.

## Предлагаемое разбиение на PR

### PR 1. Schema + audit + backfill foundation — DONE in PR #141

- добавить `books`;
- добавить `book_submissions.book_id`;
- добавить nullable `book_id` в `signup_books` и `book_priorities`;
- добавить `legacy_book_mappings` или обязательный mapping report;
- добавить audit/backfill scripts;
- перенести текущий порядок каталога в `sort_order` / `published_order`;
- применить миграцию;
- не менять runtime поведение.

### PR 2. Read catalog from `books` — DONE in PR #141

- переключить публичный каталог и `/api/books` на `books`;
- считать `signupCount` через `book_id`;
- legacy fallback разрешён только через `legacy_book_mappings`;
- убрать runtime чтение Google Sheets.

### PR 3. Switch signup/priorities runtime to `book_id` — DONE in PR #142 and PR #146

- обновить signup/priorities APIs и UI;
- запретить новые записи без `book_id`;
- оставить legacy поля временно.

Что фактически сделано:

- PR #142 перевёл UI selectedBooks/priorities на id и добавил e2e reload checks.
- PR #146 убрал legacy server fallback по `bookName` / `selectedBooks`.
- `0023_books_catalog_relax_book_name.sql` применён к production.
- Legacy `book_name` оставлен только физически в БД, nullable, до финального cleanup PR.

### PR 4. Admin books UI — DONE in PR #143

- новая вкладка `Книги`;
- CRUD/edit/publish/hide;
- soft delete через `archived_at`, без физического удаления в обычном UI;
- управление `reading_status` и `is_new` из `books`;
- e2e на создание, публикацию и скрытие.

### PR 5. Submission approval creates books — DONE in PR #141

- approval flow создаёт published `books` row;
- заявка связывается через `book_submissions.book_id`;
- автор заявки записывается на книгу через `book_id`;
- каталог не читает `book_submissions` напрямую.

### PR 6. Remove Sheets and legacy tables — PARTIAL / MOSTLY DONE in PR #144 and PR #146

- удалить Google Sheets runtime code для книг — DONE in PR #144;
- удалить `book_statuses`, `book_new_flags` — DONE in PR #141 / migration `0022`;
- подтвердить отсутствие/удалить `book_covers` — DONE, prod physical table dropped by `0024_drop_legacy_book_name.sql`;
- удалить legacy `book_name` поля — DONE, prod physical columns dropped by `0024_drop_legacy_book_name.sql`;
- удалить legacy routes:
  - `/api/admin/rename-book` — DONE in PR #146;
  - `/api/admin/book-status` and `/api/admin/book-new-flag` — DONE, removed in cleanup branch;
- обновить docs/env/tests — DONE for books-catalog cleanup.

### PR 7. Remove unused DB session table — TODO

- подтвердить, что `session` не используется при JWT strategy;
- удалить `sessions` из schema и test endpoints;
- миграция `DROP TABLE IF EXISTS "session"`;
- auth smoke/e2e.

### PR 8. Remove Auth.js account table — TODO

- переключить adapter и Google One Tap на `user_identities`;
- провести account -> user_identities consistency audit;
- удалить `accounts` из runtime schema/code;
- миграция `DROP TABLE IF EXISTS "account"`;
- auth smoke/e2e для Google OAuth, Google One Tap, magic link, Telegram.

## Риски и меры защиты

### Риск: потерять пользовательские записи при миграции

Мера:

- сначала audit report;
- затем `legacy_book_mappings`;
- затем backfill в nullable `book_id`;
- только после проверки удалять `book_name`;
- unmatched rows блокируют финальную миграцию.

### Риск: дубли книг

Мера:

- сохранять `legacy_sheets_row_id`;
- сохранять `source_submission_id`;
- audit по normalized `title + author`;
- показывать потенциальные дубли администратору;
- дубли разрешены продуктово, потому что администратор осознанно решает, одобрять ли заявку.

### Риск: перемешать порядок каталога

Мера:

- добавить `sort_order` или `published_order`;
- backfill восстанавливает текущий порядок из `fetchBooksWithCovers`;
- публичный каталог сортируется по этому полю, а не по implicit source order.

### Риск: неверные счётчики записей

Мера:

- `signupCount` считать по `book_id`;
- во временном режиме использовать `legacy_book_mappings`;
- не считать по `books.title`.

### Риск: скрытая зависимость от Google Sheets

Мера:

- отдельный этап удаления env/runtime imports;
- `rg` gate перед финальным PR;
- production smoke test без Sheets env в preview, если возможно.

### Риск: поломать существующий UX выбора книг

Мера:

- переходный совместимый shape `BookWithCover`;
- e2e на выбор книг, reload и приоритеты;
- не менять визуальную модель каталога одновременно с миграцией данных.

### Риск: published/hidden смешается с reading/read

Мера:

- хранить двумя разными полями:
  - `visibility`;
  - `reading_status`;
- в UI использовать разные controls и подписи.

### Риск: преждевременно удалить `account`

Мера:

- удалять `account` только после того, как `IdentityAwareDrizzleAdapter` перестанет читать и писать эту таблицу;
- перед миграцией сделать consistency audit `account` -> `user_identities`;
- обязательно проверить Google OAuth и Google One Tap на одном и том же Google-пользователе.

### Риск: удалить `session`, но оставить тесты/adapter assumptions

Мера:

- учитывать, что JWT strategy уже не использует DB sessions;
- до `DROP TABLE` убрать `sessionsTable` из активного adapter path или заменить adapter на custom identity-aware adapter;
- обновить test endpoints, которые сейчас могут проверять cascade cleanup в `session`.

### Риск: случайно восстановить `book_covers`

Мера:

- хранить `cover_url` в `books`;
- не добавлять внешний кеш обложек;
- финальный `rg "book_covers|bookCovers"` перед production cleanup PR.

## Проверки перед production

Перед каждым PR:

- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- e2e по затронутому flow.

Для PR с миграциями:

- dry-run/audit report;
- backup или подтверждение restore point в Neon;
- миграция должна быть idempotent там, где это backfill script;
- после миграции проверить counts:
  - books count;
  - published books count;
  - signup rows with `book_id`;
  - priority rows with `book_id`;
  - legacy mapping rows by `confidence`;
  - unmatched legacy rows.

Перед финальным удалением legacy:

- `signup_books.book_id is not null`;
- `book_priorities.book_id is not null`;
- все approved `book_submissions` имеют `book_id`;
- публичный каталог не зависит от Sheets;
- админка не зависит от `book_statuses` / `book_new_flags`;
- production DB не содержит нужных данных только в `book_covers`;
- JWT session strategy подтверждена, таблица `session` пуста или не используется;
- все auth identities представлены в `user_identities`, и `account` не является источником истины;
- production smoke test: главная, админка, выбор книги, приоритеты.

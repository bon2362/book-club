# План рефакторинга каталога книг

Дата: 2026-05-23

## Контекст

Сейчас книга не является самостоятельной доменной сущностью в базе данных.

Каталог собирается из нескольких источников:

- Google Sheets (`lib/sheets.ts`) — основной список книг;
- `book_submissions` — пользовательские предложения книг;
- `book_statuses` — ручный статус `reading` / `read`;
- `book_new_flags` — ручной override бейджа `NEW`;
- `signup_books.book_name` — записи пользователей на книги по названию;
- `book_priorities.book_name` — пользовательские приоритеты по названию.

Главная проблема: связи пользователей с книгами хранятся через название книги, а не через стабильный id. Поэтому переименование книги требует каскадно переписывать `signup_books` и `book_priorities`, а книги из Google Sheets имеют id вида `2`, `38`, где id фактически равен номеру строки в листе. Это хрупко: при изменении порядка строк связь может стать неверной.

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
- `title` — название книги;
- `author` — автор;
- `tags` — JSON/text массив тегов;
- `type` — `Book` / `Article` / другое значение, совместимое с текущим UI;
- `size` — размер, как сейчас в Sheets;
- `pages` — число страниц, nullable;
- `published_date` — строка или дата публикации как display value;
- `text_url` — ссылка на текст;
- `description` — описание;
- `cover_url` — ссылка на обложку;
- `why_read` — почему стоит читать в клубе;
- `recommendation_link` — ссылка на рекомендацию;
- `reading_status` — nullable enum-like text: `reading` / `read`;
- `visibility` — enum-like text: `hidden` / `published`;
- `is_new` — boolean;
- `source` — `admin`, `submission`, `sheets_import`;
- `source_submission_id` — nullable FK на `book_submissions.id`;
- `legacy_sheets_row_id` — nullable text для аудита миграции;
- `created_at`;
- `updated_at`;
- `published_at`;
- `hidden_at`.

Индексы:

- `books_visibility_idx` на `visibility`;
- `books_source_submission_id_idx` на `source_submission_id`;
- опционально unique partial index на `source_submission_id`, если одна заявка должна создавать только одну книгу.

Правила:

- публичный каталог показывает только `visibility = 'published'`;
- админка показывает все книги;
- `reading_status` не влияет на видимость;
- `is_new` заменяет `book_new_flags`;
- `reading_status` заменяет `book_statuses`.

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

## Этап 0. Аудит данных перед миграцией

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

Артефакт:

- `docs/planning-artifacts/books-catalog-migration-audit.md` или generated report в `output/`.

Критерий готовности:

- есть список всех конфликтов;
- понятна стратегия сопоставления `book_name` -> `books.id`;
- нет неизвестных записей, которые silently потеряются.

## Этап 1. Создать `books` без переключения runtime

Цель: добавить новую таблицу без изменения поведения сайта.

Задачи:

- добавить `books` в `lib/db/schema.ts`;
- добавить `book_submissions.book_id`;
- сгенерировать Drizzle migration;
- написать idempotent migration/backfill script:
  - импортирует все текущие книги из Google Sheets в `books`;
  - переносит `book_statuses.status` в `books.reading_status`;
  - переносит `book_new_flags.is_new` в `books.is_new`;
  - создаёт `books` rows для approved `book_submissions`, если их ещё нет;
  - связывает approved `book_submissions.book_id` с созданной книгой;
  - сохраняет `legacy_sheets_row_id` для книг из Sheets.

Правила импорта:

- книги из Sheets получают `source = 'sheets_import'`;
- книги из approved submissions получают `source = 'submission'`;
- книги из Sheets импортируются с `visibility = 'published'`;
- approved submissions импортируются с `visibility = 'published'`;
- вручную созданные позже книги будут получать `source = 'admin'` и `visibility = 'hidden'`;
- если у sheets-книги есть `book_new_flags`, значение переносится в `books.is_new`;
- если у sheets-книги есть `book_statuses`, значение переносится в `books.reading_status`.

Критерий готовности:

- таблица создана;
- backfill можно запускать повторно без дублей;
- количество опубликованных книг в `books` совпадает с текущим публичным каталогом;
- ручная проверка показывает, что книги с legacy id `2` и `38` перенеслись корректно:
  - `2` -> “Революционный темперамент. Париж в 1748–1789 годах”;
  - `38` -> “Жизнь и времена либеральной”.

## Этап 2. Перевести чтение каталога на `books`

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

- `signupCount` можно считать по `signup_books.book_name`, сопоставляя `books.title`;
- текущие пользовательские записи продолжают работать;
- Google Sheets код остаётся в проекте только для backfill/fallback до завершения миграции.

Критерий готовности:

- публичный каталог визуально совпадает с прежним;
- админка показывает те же книги, статусы и `NEW`;
- тесты покрывают чтение из `books`;
- Google Sheets не участвует в runtime чтении каталога.

## Этап 3. Перевести пользовательские связи на `book_id`

Цель: избавиться от связи “пользователь -> название книги”.

Задачи:

- добавить nullable `book_id` в `signup_books`;
- добавить nullable `book_id` в `book_priorities`;
- написать backfill:
  - для каждой `signup_books.book_name` найти соответствующую `books.id`;
  - для каждой `book_priorities.book_name` найти соответствующую `books.id`;
  - зафиксировать все unmatched строки в отчёте;
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

- на время PR можно читать `book_id ?? matchByBookName(book_name)`;
- запись новых данных должна идти в `book_id`;
- legacy `book_name` можно продолжать заполнять как cache только до финальной уборки.

Критерий готовности:

- все существующие `signup_books` имеют `book_id`;
- все существующие `book_priorities` имеют `book_id`;
- нет unmatched записей без ручного решения;
- выбор книг и приоритеты сохраняются после reload;
- переименование книги больше не требует обновлять пользовательские связи.

## Этап 4. Админская вкладка “Книги”

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
  - на первом этапе лучше не физическое удаление, а `hidden`;
  - физическое удаление разрешать только если нет signup/priorities, либо делать отдельный admin-only destructive action с подтверждением.

Задачи API:

- `GET /api/admin/books`;
- `POST /api/admin/books`;
- `PATCH /api/admin/books/:id`;
- опционально `DELETE /api/admin/books/:id` только для безопасного случая;
- валидация admin session;
- серверная нормализация tags/pages/urls.

Критерий готовности:

- админ может вручную создать hidden книгу;
- после переключения в published книга появляется в публичном каталоге;
- после переключения в hidden книга пропадает из публичного каталога, но остаётся в админке;
- все поля редактируются;
- изменения сохраняются после reload.

## Этап 5. Перевести approval flow заявок на `books`

Цель: `book_submissions` перестаёт быть источником книг в каталоге.

Задачи:

- при `PATCH /api/admin/submissions/:id` со `status = approved`:
  - создать `books` row из полей заявки;
  - `visibility = 'published'`;
  - `source = 'submission'`;
  - `source_submission_id = submission.id`;
  - записать `book_submissions.book_id`;
  - автоматически записать автора заявки на созданную книгу через `signup_books.book_id`;
- если approved submission уже имеет `book_id`, не создавать дубль;
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

## Этап 6. Удалить runtime-зависимость от Google Sheets

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

## Этап 7. Удалить legacy таблицы и поля

Цель: убрать дублирующие сущности после стабильной работы новой модели.

Удалить:

- `book_statuses`;
- `book_new_flags`;
- `signup_books.book_name`;
- `book_priorities.book_name`;
- legacy API:
  - `/api/admin/book-status`;
  - `/api/admin/book-new-flag`;
  - `/api/admin/rename-book`;
- код каскадного переименования в submission/admin routes;
- любые helper-и, которые ищут книгу по названию как primary mechanism.

Оставить:

- `book_submissions` как историю предложений и moderation queue;
- `book_submissions.book_id` как связь заявки с опубликованной книгой.

Критерий готовности:

- `rg "bookName|book_name|bookStatuses|bookNewFlags|fetchBooks|Google Sheets"` не находит runtime legacy usage, кроме исторических docs/tests где это явно ожидаемо;
- схема БД не содержит legacy таблиц/полей;
- тесты и e2e проходят;
- production работает после миграции.

## Этап 8. Финальная чистка тестов и документации

Задачи:

- обновить unit tests:
  - books repository;
  - signup/priorities by `book_id`;
  - submission approval -> book creation;
  - admin books API;
- обновить e2e:
  - пользователь выбирает книгу и reload подтверждает запись;
  - пользователь расставляет приоритеты и reload подтверждает порядок;
  - админ создаёт hidden книгу;
  - админ публикует книгу, и она появляется в каталоге;
  - админ скрывает книгу, и она пропадает из каталога;
  - пользователь предлагает книгу, админ одобряет, книга публикуется;
- обновить feature docs:
  - `docs/features/books-catalog.md`;
  - `docs/features/admin-panel.md`;
  - `docs/features/infra.md`;
- обновить seed/test fixtures, чтобы они использовали `books`;
- проверить, что `NEXTAUTH_TEST_MODE` больше не подмешивает тестовые книги через Sheets layer.

## Предлагаемое разбиение на PR

### PR 1. Schema + audit + backfill foundation

- добавить `books`;
- добавить `book_submissions.book_id`;
- добавить audit/backfill scripts;
- применить миграцию;
- не менять runtime поведение.

### PR 2. Read catalog from `books`

- переключить публичный каталог и `/api/books` на `books`;
- сохранить legacy signup/priorities по названию;
- убрать runtime чтение Google Sheets.

### PR 3. Migrate signup/priorities to `book_id`

- добавить `book_id` в `signup_books` и `book_priorities`;
- backfill;
- обновить signup/priorities APIs и UI;
- оставить legacy поля временно.

### PR 4. Admin books UI

- новая вкладка `Книги`;
- CRUD/edit/publish/hide;
- управление `reading_status` и `is_new` из `books`;
- e2e на создание, публикацию и скрытие.

### PR 5. Submission approval creates books

- approval flow создаёт published `books` row;
- заявка связывается через `book_submissions.book_id`;
- автор заявки записывается на книгу через `book_id`;
- каталог не читает `book_submissions` напрямую.

### PR 6. Remove Sheets and legacy tables

- удалить Google Sheets runtime code для книг;
- удалить `book_statuses`, `book_new_flags`;
- удалить legacy `book_name` поля;
- удалить legacy routes;
- обновить docs/env/tests.

## Риски и меры защиты

### Риск: потерять пользовательские записи при миграции

Мера:

- сначала audit report;
- затем backfill в nullable `book_id`;
- только после проверки удалять `book_name`;
- unmatched rows блокируют финальную миграцию.

### Риск: дубли книг

Мера:

- сохранять `legacy_sheets_row_id`;
- сохранять `source_submission_id`;
- audit по normalized `title + author`;
- ручной список конфликтов перед import.

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
  - unmatched legacy rows.

Перед финальным удалением legacy:

- `signup_books.book_id is not null`;
- `book_priorities.book_id is not null`;
- все approved `book_submissions` имеют `book_id`;
- публичный каталог не зависит от Sheets;
- админка не зависит от `book_statuses` / `book_new_flags`;
- production smoke test: главная, админка, выбор книги, приоритеты.

# Панель администратора

## Что делает
Позволяет администраторам управлять участниками клуба и каталогом книг. Вкладки: «Участники», «Каталог» (CRUD книг), «Теги», «Заявки», «Фидбеки», «Интро».

## Как работает
- **Контроль доступа** — `session.user.isAdmin` проверяется на сервере; не-администраторы получают 403 от всех роутов `/api/admin/*`
- **Вкладка «Участники»** — показывает пользователей и их записи из Postgres (`user` + `signup_books`); поиск работает по имени и Telegram. Администратор может удалить пользователя через `DELETE /api/admin/delete-user` или слить дубль в основной аккаунт через `POST /api/admin/users/merge`
- **Вкладка «Каталог»** — CRUD-управление таблицей `books`. Список с поиском и фильтрами по видимости (`published`/`hidden`), статусу прочтения и источнику (`admin`/`submission`). Форма создания: новая книга по умолчанию `visibility='hidden'`, `source='admin'`, `is_new=false`. Inline-редактор позволяет менять все поля и переключать публикацию (`Опубликовать`/`Скрыть`).
- **Выбор тега** — в формах создания и редактирования тег выбирается из `<select>` (закрытый набор), а не вводится текстом. Список опций (`allTags`) строится из уникальных тегов всех загруженных книг, отсортированных по алфавиту; завести новый тег через форму нельзя. Это исключает рассогласование тегов из-за регистра/пробелов (фильтр каталога сравнивает строки точно). При редактировании текущий тег книги всегда присутствует в опциях, даже если он вне общего набора. Модель данных не меняется — тег по-прежнему хранится как `books.tags` (`string[]`), просто это массив из одного значения.
- **Статусы книг** — поле `books.reading_status` (`reading`/`read`/null); обновляется через `PATCH /api/admin/books/:id`
- **Флаги new** — поле `books.is_new`; обновляется через `PATCH /api/admin/books/:id`
- **Описания тегов** — таблица `tag_descriptions`; редактируются inline через `PATCH /api/admin/tag-description`
- **Отображение приоритетов** — `AdminStatusBar` показывает размер очереди digest и топ приоритетных книг по каждому пользователю

## API каталога книг
- `GET /api/admin/books` — список всех книг с `signupCount`
- `POST /api/admin/books` — создать книгу. Серверная нормализация: `tags` (string|array → string[]), `pages` (string → int|null), валидация `type`/`visibility`/`readingStatus`. Default: `source='admin'`, `visibility='hidden'`. Возвращает 400 при невалидных полях.
- `PATCH /api/admin/books/:id` — обновить поля книги. При смене visibility выставляет `publishedAt`/`hiddenAt`.

## Записи пользователей на книги

Google Sheets лист `signups` больше не участвует в runtime-коде.
Записи хранятся в Postgres:

- `signup_books` — связь пользователя с выбранными книгами
- `book_priorities` — порядок приоритетов пользователя
- `user.priorities_set` — флаг, что пользователь расставил приоритеты

`lib/signup-books.ts` даёт совместимый `UserSignup`-shape для старых UI-мест, но читает и пишет Postgres, а не Google Sheets.
Старый лист `signups` может оставаться только как legacy-архив или источник для разовой миграции `scripts/migrate-signups.ts`.

## Слияние дублей пользователей

Карточка пользователя в админке показывает внутренний ID пользователя: по нему можно кликнуть, чтобы скопировать ID в буфер обмена. Для слияния администратор сначала копирует ID основного аккаунта, затем открывает карточку дубля, вставляет этот ID в поле «ID аккаунта, который оставить» и видит найденный аккаунт (имя + ID) под полем. Если ID не найден или API слияния вернул ошибку, сообщение показывается прямо в карточке пользователя. Причина опциональна, подтверждение выполняется кнопкой `Merge to user`. API `POST /api/admin/users/merge` требует `sourceUserId` и `targetUserId`, принимает опциональный `reason`, запрещает self-merge и не позволяет админу слить собственный аккаунт как source.

Вся операция выполняется внутри `withAuditContext({ source: 'admin', reason })`. Сервис `lib/admin/user-merge.ts` переносит identities, записи на книги, приоритеты, заявки, feedback, activity events, Telegram preauth tokens и matching-связи. `signup_books` объединяются по книге с ранней датой записи и сильнейшим статусом `read > reading > null`; `book_priorities` сохраняют порядок target и добавляют source-only книги в конец. Source user удаляется последним.

Для читаемого аудита создаётся строка `user_merge_events` со снимками source/target и счётчиками переноса; детальные row-level изменения по-прежнему пишет `audit_log`.

## Ключевые файлы
- `components/nd/AdminPanel.tsx` — основной UI администратора (вкладки, список участников, список книг)
- `components/nd/AdminBooksCatalog.tsx` — вкладка «Каталог»: список, фильтры, форма создания, inline-редактор
- `components/nd/AdminStatusBar.tsx` — статистика очереди digest
- `app/api/admin/books/route.ts`, `app/api/admin/books/[id]/route.ts` — CRUD API каталога
- `app/api/admin/users/merge/route.ts` — admin API слияния дублей
- `app/api/admin/` — остальные API routes (delete-user, tag-description, priorities, submissions и др.)
- `lib/books.ts` — `fetchBooksWithCovers`, `fetchBooksForAdmin`, `createBook`, `updateBook`, `BookValidationError`
- `lib/signup-books.ts` — `getAllSignups()`, `upsertSignup()`, `removeBookFromSignup()`, тип `UserSignup`
- `lib/admin-users.ts` — агрегирует карточку пользователя, записи на книги, предложения и фидбеки
- `lib/admin/user-merge.ts` — правила и транзакционный сервис слияния дублей
- `lib/db/schema.ts` — таблицы `books`, `signupBooks`, `tagDescriptions`, `bookPriorities` и др.

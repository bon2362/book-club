# Панель администратора

## Что делает
Позволяет администраторам управлять участниками клуба и каталогом книг. Вкладки: «Участники», «Каталог» (CRUD книг), «Теги», «Заявки», «Фидбеки», «Интро».

## Как работает
- **Контроль доступа** — `session.user.isAdmin` проверяется на сервере; не-администраторы получают 403 от всех роутов `/api/admin/*`
- **Вкладка «Участники»** — показывает пользователей и их записи из Postgres (`user` + `signup_books`); администратор может удалить пользователя через `DELETE /api/admin/delete-user`
- **Вкладка «Каталог»** — CRUD-управление таблицей `books`. Список с поиском и фильтрами по видимости (`published`/`hidden`), статусу прочтения и источнику (`admin`/`submission`). Форма создания: новая книга по умолчанию `visibility='hidden'`, `source='admin'`, `is_new=false`. Inline-редактор позволяет менять все поля и переключать публикацию (`Опубликовать`/`Скрыть`).
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

## Ключевые файлы
- `components/nd/AdminPanel.tsx` — основной UI администратора (вкладки, список участников, список книг)
- `components/nd/AdminBooksCatalog.tsx` — вкладка «Каталог»: список, фильтры, форма создания, inline-редактор
- `components/nd/AdminStatusBar.tsx` — статистика очереди digest
- `app/api/admin/books/route.ts`, `app/api/admin/books/[id]/route.ts` — CRUD API каталога
- `app/api/admin/` — остальные API routes (delete-user, tag-description, priorities, submissions и др.)
- `lib/books.ts` — `fetchBooksWithCovers`, `fetchBooksForAdmin`, `createBook`, `updateBook`, `BookValidationError`
- `lib/signup-books.ts` — `getAllSignups()`, `upsertSignup()`, `removeBookFromSignup()`, тип `UserSignup`
- `lib/admin-users.ts` — агрегирует карточку пользователя, записи на книги, предложения и фидбеки
- `lib/db/schema.ts` — таблицы `books`, `signupBooks`, `tagDescriptions`, `bookPriorities` и др.

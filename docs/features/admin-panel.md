# Панель администратора

## Что делает
Позволяет администраторам управлять участниками клуба и каталогом книг. Вкладки: «Участники» (список с записями) и «Книги» (книги со списком участников по каждой). Администраторы могут удалять участников, менять статусы книг, устанавливать флаги new/not-new, добавлять/удалять книги и обновлять каталог из Google Sheets.

## Как работает
- **Контроль доступа** — `session.user.isAdmin` проверяется на сервере; не-администраторы получают 403 от всех роутов `/api/admin/*`
- **Вкладка «Участники»** — показывает пользователей и их записи из Postgres (`user` + `signup_books`); администратор может удалить пользователя через `DELETE /api/admin/delete-user`
- **Вкладка «Книги»** — список книг из Google Sheets + статусы из БД; список участников по каждой книге показывает записавшихся
- **Статусы книг** — таблица `book_statuses` хранит статус `reading` | `read` для каждой книги; обновляется через `PATCH /api/admin/book-status`
- **Флаги new** — таблица `book_new_flags`; переключается через `PATCH /api/admin/book-new-flag`
- **Описания тегов** — таблица `tag_descriptions`; редактируются inline через `PATCH /api/admin/tag-description`
- **Синхронизация с Sheets** — `POST /api/sync` запускает повторный fetch каталога книг из Google Sheets и сбрасывает кэш главной/API
- **Отображение приоритетов** — `AdminStatusBar` показывает размер очереди digest и топ приоритетных книг по каждому пользователю

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
- `components/nd/AdminStatusBar.tsx` — статистика очереди digest
- `app/api/admin/` — все API routes администратора (book-status, book-new-flag, delete-user, tag-description, priorities, submissions и др.)
- `lib/signup-books.ts` — `getAllSignups()`, `upsertSignup()`, `removeBookFromSignup()`, тип `UserSignup`
- `lib/admin-users.ts` — агрегирует карточку пользователя, записи на книги, предложения и фидбеки
- `lib/db/schema.ts` — таблицы `signupBooks`, `bookStatuses`, `bookNewFlags`, `tagDescriptions`, `bookPriorities`

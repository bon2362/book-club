# Панель администратора

## Что делает
Позволяет администраторам управлять участниками клуба и каталогом книг. Вкладки: «Участники» (список с записями) и «Книги» (книги со списком участников по каждой). Администраторы могут удалять участников, менять статусы книг, устанавливать флаги new/not-new, добавлять/удалять книги и синхронизировать данные из Google Sheets.

## Как работает
- **Контроль доступа** — `session.user.isAdmin` проверяется на сервере; не-администраторы получают 403 от всех роутов `/api/admin/*`
- **Вкладка «Участники»** — показывает все записи `UserSignup` (из `lib/signups.ts`); администратор может удалить пользователя через `DELETE /api/admin/delete-user`
- **Вкладка «Книги»** — список книг из Google Sheets + статусы из БД; список участников по каждой книге показывает записавшихся
- **Статусы книг** — таблица `book_statuses` хранит статус `reading` | `read` для каждой книги; обновляется через `PATCH /api/admin/book-status`
- **Флаги new** — таблица `book_new_flags`; переключается через `PATCH /api/admin/book-new-flag`
- **Описания тегов** — таблица `tag_descriptions`; редактируются inline через `PATCH /api/admin/tag-description`
- **Синхронизация с Sheets** — `POST /api/sync` запускает повторный fetch из Google Sheets; обновляет локальное состояние в БД
- **Отображение приоритетов** — `AdminStatusBar` показывает размер очереди digest и топ приоритетных книг по каждому пользователю

## Google Sheets — лист `signups`

| Колонка | Индекс | Содержимое |
|---------|--------|------------|
| A | 0 | Timestamp |
| B | 1 | userId (email пользователя) |
| C | 2 | name |
| D | 3 | email |
| E | 4 | contacts (Telegram) |
| F | 5 | selectedBooks (JSON) |
| G | 6 | DeleteByUser — `'TO DELETE'` если пользователь сам удалил аккаунт |
| H | 7 | DeleteByAdmin — `'yes'` если удалён администратором |

`getAllSignups()` читает диапазон `A:H` (важно — не `A:F`, иначе столбец G не попадает в ответ) и фильтрует строки где `r[6] === 'TO DELETE'` — скрывает мягко удалённых из всех списков.

## Ключевые файлы
- `components/nd/AdminPanel.tsx` — основной UI администратора (вкладки, список участников, список книг)
- `components/nd/AdminStatusBar.tsx` — статистика очереди digest
- `app/api/admin/` — все API routes администратора (book-status, book-new-flag, delete-user, tag-description, priorities, submissions и др.)
- `lib/signups.ts` — `getAllSignups()`, `upsertSignup()`, `markSignupDeletedByAdmin()`, тип `UserSignup`
- `lib/db/schema.ts` — таблицы `bookStatuses`, `bookNewFlags`, `tagDescriptions`, `bookPriorities`

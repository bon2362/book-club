# Admin Panel

## What it does
Lets admins manage club members and the books catalog. Tabs: "Участники" (members list with signups) and "Книги" (books with per-book member lists). Admins can delete members, change book statuses, set new/not-new flags, add/remove books, and sync data from Google Sheets.

## How it works
- **Access control** — `session.user.isAdmin` checked server-side; non-admins receive 403 from all `/api/admin/*` routes
- **Members tab** — shows all `UserSignup` records (from `lib/signups.ts`); admin can delete user via `DELETE /api/admin/delete-user`
- **Books tab** — lists books from Google Sheets + DB statuses; per-book member list shows who signed up
- **Book statuses** — `book_statuses` table stores `reading` | `read` status per book; updated via `PATCH /api/admin/book-status`
- **New flags** — `book_new_flags` table; toggled via `PATCH /api/admin/book-new-flag`
- **Tag descriptions** — `tag_descriptions` table; editable inline via `PATCH /api/admin/tag-description`
- **Sheets sync** — `POST /api/sync` triggers re-fetch from Google Sheets; updates local DB state
- **Priority display** — `AdminStatusBar` shows digest queue size and top priority books per user

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

`getAllSignups()` фильтрует строки где `r[6] === 'TO DELETE'` — скрывает мягко удалённых из всех списков.

## Key files
- `components/nd/AdminPanel.tsx` — main admin UI (tabs, member list, book list)
- `components/nd/AdminStatusBar.tsx` — digest queue stats
- `app/api/admin/` — all admin API routes (book-status, book-new-flag, delete-user, tag-description, priorities, submissions, etc.)
- `lib/signups.ts` — `fetchSignups()`, `UserSignup` type
- `lib/db/schema.ts` — `bookStatuses`, `bookNewFlags`, `tagDescriptions`, `bookPriorities` tables

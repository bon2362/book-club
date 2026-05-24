# Каталог книг

## Что делает
Отображает список книг клуба. Каждая книга показывает название, автора, теги, описание (раскрывающееся), обложку и статус чтения. Каталог полностью управляется через сайт.

## Как работает
- **Источник данных** — таблица `books` в Postgres (Neon). Чтение через `lib/books.ts` (`fetchBooksWithCovers`, `fetchBooksForAdmin`, `fetchBookById`). Google Sheets больше не участвует в runtime каталога.
- **Видимость** — публичный каталог показывает только `visibility='published'` и `archived_at IS NULL`. Админка показывает все неархивные книги.
- **Управление каталогом** — админская вкладка «Каталог» (`AdminBooksCatalog.tsx` + `/api/admin/books`): создание, редактирование, публикация/скрытие, soft delete через `archived_at`.
- **Approved-заявки** — при approval в `/api/admin/submissions/:id` создаётся `books` row с `source='submission'`, `visibility='published'` (см. `lib/book-publish.ts`).
- **Обложки** — `cover_url` хранится прямо на `books`. Загружается админом при создании/редактировании.
- **CoverImage** — client component (`components/nd/CoverImage.tsx`); показывает обложку если задан `coverUrl`, при ошибке загрузки показывает инициалы автора (`onError`).
- **BookCard** — раскрытие/скрытие описаний длиннее 120 символов.
- **Числа приоритета** — отображаются из `book_priorities` по `book_id`; пока пользователь не выставил приоритеты — `—`.

## Ключевые файлы
- `lib/books.ts` — чтение из БД (`fetchBooksWithCovers`, `fetchBooksForAdmin`, `fetchBookById`); CRUD-хелперы (`createBook`, `updateBook`)
- `lib/books-with-covers.ts` — backward-compat shim, re-export из `lib/books.ts`
- `lib/book-publish.ts` — promote approved submission → published book
- `app/api/admin/books/` — admin CRUD API
- `components/nd/AdminBooksCatalog.tsx` — админская вкладка каталога
- `components/nd/CoverImage.tsx` — отображение обложки с fallback на инициалы
- `components/nd/BookCard.tsx` — карточка книги
- `components/nd/BooksPage.tsx` — layout, поиск, фильтрация
- `lib/search.ts` — client-side поиск
- `lib/db/schema.ts` — таблица `books` (см. поля в `docs/planning-artifacts/books-catalog-db-refactor-plan.md`)

## Историческое
- `lib/sheets.ts` сохранён только для `scripts/books-catalog-audit.ts` (audit при миграции). Из runtime не вызывается, env vars `GOOGLE_SHEETS_ID`/`GOOGLE_SERVICE_ACCOUNT_KEY` сделаны optional в `env.ts`.
- `/api/sync` (ручная синхронизация с Google Sheets) удалён — каталог теперь полностью в БД, отдельная синхронизация не нужна.

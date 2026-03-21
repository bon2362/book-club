# Каталог книг

## Что делает
Отображает список книг клуба. Каждая книга показывает название, автора, теги, описание (раскрывающееся), обложку и статус чтения. Книги загружаются с Google Sheets на сервере.

## Как работает
- **Источник данных** — Google Sheets через `lib/sheets.ts`; `fetchBooks()` читает все строки, кэширует в памяти на 10 минут. `coverUrl` берётся из колонки L (`row[11]`)
- **Без внешнего API обложек** — Google Books API удалён (429 rate limits). Обложки нужно добавлять вручную в колонку L таблицы
- **Pass-through** — `lib/books-with-covers.ts` маппит строки из sheets в объекты `BookWithCover`; запросов к БД нет
- **CoverImage** — client component (`components/nd/CoverImage.tsx`); показывает обложку если задан `coverUrl`, при ошибке загрузки показывает инициалы автора (`onError`)
- **BookCard** — показывает информацию о книге с раскрытием/скрытием описаний длиннее 120 символов; кнопки «Читать далее» / «Свернуть»
- **Числа приоритета** — книги показывают ранг из таблицы `book_priorities`; отображается как `—` пока пользователь не выставил приоритеты

## Ключевые файлы
- `lib/sheets.ts` — Google Sheets client, `fetchBooks()`, тип `Book`, coverUrl из колонки L
- `lib/books-with-covers.ts` — маппинг `Book[]` → `BookWithCover[]`
- `components/nd/CoverImage.tsx` — отображение обложки с fallback на инициалы
- `components/nd/BookCard.tsx` — раскрывающаяся карточка книги
- `components/nd/BooksPage.tsx` — layout страницы, поиск, фильтрация
- `lib/search.ts` — client-side логика поиска

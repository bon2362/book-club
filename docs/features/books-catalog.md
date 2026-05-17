# Каталог книг

## Что делает
Отображает список книг клуба. Каждая книга показывает название, автора, теги, описание (раскрывающееся), обложку и статус чтения. Книги загружаются с Google Sheets на сервере.

## Как работает
- **Источник данных** — Google Sheets через `lib/sheets.ts`; `fetchBooks()` читает все строки, кэширует в памяти на 10 минут. `coverUrl` берётся из колонки N (`row[13]`)
- **Без внешнего API обложек** — Google Books API удалён (429 rate limits). Обложки нужно добавлять вручную в колонку N таблицы
- **Объединение источников** — `lib/books-with-covers.ts` объединяет строки из sheets с approved-заявками из БД и флагами новинок
- **CoverImage** — client component (`components/nd/CoverImage.tsx`); показывает обложку если задан `coverUrl`, при ошибке загрузки показывает инициалы автора (`onError`)
- **BookCard** — показывает информацию о книге с раскрытием/скрытием описаний длиннее 120 символов; кнопки «Читать далее» / «Свернуть»
- **Числа приоритета** — книги показывают ранг из таблицы `book_priorities`; отображается как `—` пока пользователь не выставил приоритеты

## Ключевые файлы
- `lib/sheets.ts` — Google Sheets client, `fetchBooks()`, тип `Book`, coverUrl из колонки N
- `lib/books-with-covers.ts` — объединение `Book[]`, approved-заявок и флагов новинок в `BookWithCover[]`
- `components/nd/CoverImage.tsx` — отображение обложки с fallback на инициалы
- `components/nd/BookCard.tsx` — раскрывающаяся карточка книги
- `components/nd/BooksPage.tsx` — layout страницы, поиск, фильтрация
- `lib/search.ts` — client-side логика поиска

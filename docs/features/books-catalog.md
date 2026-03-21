# Books Catalog

## What it does
Displays the club's reading list. Each book shows title, author, tags, description (expandable), cover image, and read status. Books are fetched from Google Sheets on the server.

## How it works
- **Data source** — Google Sheets via `lib/sheets.ts`; `fetchBooks()` reads all rows, caches in-memory for 10 minutes. `coverUrl` comes from column L (row[11])
- **No external cover API** — Google Books API was removed (429 rate limits). Covers must be added manually to column L in the spreadsheet
- **Pass-through** — `lib/books-with-covers.ts` maps sheet rows to `BookWithCover` objects; no DB queries involved
- **CoverImage** — client component (`components/nd/CoverImage.tsx`); shows cover if `coverUrl` is set, falls back to author initials on `onError`
- **BookCard** — shows book info with expand/collapse for descriptions > 120 characters; "Читать далее" / "Свернуть" buttons
- **Priority numbers** — books show rank from `book_priorities` table; shown as `—` until user sets priorities

## Key files
- `lib/sheets.ts` — Google Sheets client, `fetchBooks()`, `Book` type, coverUrl from column L
- `lib/books-with-covers.ts` — maps `Book[]` → `BookWithCover[]`
- `components/nd/CoverImage.tsx` — cover display with initials fallback
- `components/nd/BookCard.tsx` — expandable book card
- `components/nd/BooksPage.tsx` — page layout, search, filter
- `lib/search.ts` — client-side search logic

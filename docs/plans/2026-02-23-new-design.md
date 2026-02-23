# New Design Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan.

**Goal:** Build a radically new monochrome editorial UI at `/new-design`, inspired by lithub.com, with automatic book cover fetching from Open Library cached in Postgres.

**Architecture:** Parallel routes under `app/new-design/` with new components under `components/nd/`. All business logic (`lib/sheets`, `lib/signups`, `lib/search`, `lib/auth`, `app/api/`) is reused unchanged. One new library module `lib/covers.ts` added. Drizzle schema extended with `book_covers` table.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Inter + Playfair Display fonts, Drizzle ORM + Neon Postgres, Open Library Covers API (no key required)

---

## Visual Identity

### Colors — strict monochrome

| Token | Value | Usage |
|---|---|---|
| Background | `#FFFFFF` | Page, cards |
| Text | `#111111` | Titles, body |
| Gray-1 | `#666666` | Author, metadata |
| Gray-2 | `#999999` | Year, pages, tags |
| Border | `#E5E5E5` | Card borders, dividers |
| Rule | `#000000` | Header underline, structural lines |

No accent color. Book covers provide all color on the page.

### Typography

- **Headings (book titles):** Playfair Display — already loaded, no new dependencies
- **Body, labels, buttons:** Inter (with `system-ui` fallback)
- **Category tags:** Inter, `text-transform: uppercase`, `0.65rem`, `letter-spacing: 0.1em`

### Spacing and rhythm

- Dense layout, minimal whitespace — close to Lithub
- `1px solid #000` horizontal rules as primary structural element
- No border-radius, no box shadows, no decorative corners

---

## Page Structure

### Header

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  КНИЖНЫЙ КЛУБ          Долгое наступление   [Войти]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- Left: `КНИЖНЫЙ КЛУБ` — Inter all-caps, 0.65rem, #999
- Center: `Долгое наступление` — Playfair Display, 1.25rem
- Right: `Войти` button or avatar + `Выйти` when logged in
- Bottom border: `2px solid #000`

### Search and filters bar

Below header, full-width row:
```
  [🔍 Поиск по названию или автору...]  [Тема ▾]  [Автор ▾]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Book grid

3 columns on desktop, 2 on tablet, 1 on mobile. Each card:

```
┌─────────────────┐
│                 │  ← cover image (2:3 aspect ratio)
│   [cover img]   │     fallback: light gray (#F5F5F5) rectangle
│                 │     with author initials centered
└─────────────────┘
ЭКОНОМИКА · ИСТОРИЯ      ← tags, Inter all-caps, #999
━━━━━━━━━━━━━━━━━━━━
Название книги            ← Playfair Display 1.1rem, #111
Иван Иванов          2019 ← Inter italic #666, year #999 right
[  ХОЧУ ЧИТАТЬ  ]         ← full-width, border 1px #111, Inter
```

Button states:
- Default: `border: 1px solid #111`, `background: transparent`, `color: #111`
- Selected/active: `background: #111`, `color: #fff`

### `/new-design/admin`

Same header. Table layout (not cards): columns — Name, Telegram, Books signed up. Monochrome table style, `border-collapse: collapse`, `1px solid #E5E5E5` cell borders.

### Auth modal

White background, `2px solid #111` border, no rounded corners. Google sign-in button styled as a card button (same style as book cards). No decorative elements.

---

## Book Covers Feature

### Data source

Open Library — free, no API key required.

**Search endpoint:**
```
GET https://openlibrary.org/search.json?title={title}&author={author}&limit=1
```
Extract `cover_i` from first result, then:
```
https://covers.openlibrary.org/b/id/{cover_i}-L.jpg
```

### Database schema

New table added to Drizzle schema:

```ts
export const bookCovers = pgTable('book_covers', {
  bookId:    text('book_id').primaryKey(),
  coverUrl:  text('cover_url'),          // NULL = not found
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
})
```

### Logic

```
fetchBooks() → join with book_covers
  ├── book_id has row in book_covers → use cached coverUrl (may be null)
  └── book_id not in book_covers     → trigger background fetch
        → POST to Open Library search
        → INSERT into book_covers (url or null)
        → next page load shows cover
```

- Background fetch: fire-and-forget, does not block page response
- Re-fetch: only triggered via "Force sync" in admin panel
- Rate limit: ~100 req/min from Open Library — sufficient for dozens of books

### Fallback (no cover found)

Gray rectangle `#F5F5F5` with author initials centered:
- `"Иван Иванов"` → `"ИИ"`
- `"Karl Marx"` → `"KM"`
- Inter, 1.5rem, `#999`

### `Book` type extension

```ts
interface Book {
  // ...existing fields
  coverUrl: string | null  // new
}
```

`fetchBooks()` in `lib/sheets.ts` extended to join cover data from DB.

---

## File Structure

```
app/
  new-design/
    layout.tsx          ← Inter font, nd-specific layout wrapper
    page.tsx            ← server component, fetches books+covers
    admin/
      page.tsx          ← admin panel, auth-gated

components/
  nd/
    Header.tsx          ← top bar with login state
    BookGrid.tsx        ← responsive CSS grid wrapper
    BookCard.tsx        ← card with cover, metadata, toggle button
    CoverImage.tsx      ← img or initials fallback
    AuthModal.tsx       ← monochrome modal
    ContactsForm.tsx    ← name + telegram modal
    AdminPanel.tsx      ← users/books table

lib/
  covers.ts             ← fetchCover(bookId, title, author), background trigger
  db/
    schema.ts           ← add bookCovers table (extends existing schema)

docs/
  plans/
    2026-02-23-new-design.md  ← this file
```

### What is reused unchanged

- `lib/sheets.ts` — `fetchBooks`, `Book` type (extended, not replaced)
- `lib/signups.ts` — user signup logic
- `lib/search.ts` — fuzzy search
- `lib/auth.ts` — NextAuth config
- `app/api/signup/`, `app/api/admin/`, `app/api/sync/` — all API routes

---

## Out of Scope

- Dark mode (light only for new design)
- Featured/hero books (uniform grid)
- Image storage (URLs only, no file uploads)
- ISBN-based cover lookup (title+author search is sufficient)

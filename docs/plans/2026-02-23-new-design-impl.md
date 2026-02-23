# New Design Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a monochrome editorial UI at `/new-design` (lithub-inspired) with automatic book cover fetching from Open Library cached in Postgres.

**Architecture:** New routes under `app/new-design/`, new components under `components/nd/`, new lib modules `lib/covers.ts` and `lib/books-with-covers.ts`. All existing `lib/` modules and `app/api/` routes are reused unchanged. Old design at `/` is untouched.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Inter + Playfair Display (Google Fonts), Drizzle ORM + Neon Postgres, Open Library Covers API (no key required)

---

## Context

**Existing files to know:**
- `lib/sheets.ts` — `fetchBooks()`, `Book` interface (id, name, author, tags, description, date, pages, link, type, why)
- `lib/db/index.ts` — exports `db` (Drizzle client)
- `lib/db/schema.ts` — Drizzle tables: `users`, `accounts`, `sessions`, `verificationTokens`
- `lib/signups.ts` — `getAllSignups()`, `upsertSignup()`, `UserSignup` type
- `lib/search.ts` — `searchBooks(books, query)`
- `lib/auth.ts` — NextAuth `auth()` function
- `app/page.tsx` — pattern for server components: `auth()` + `fetchBooks()` + `SessionProvider`
- `app/admin/page.tsx` — pattern for auth-gated admin pages

**Do NOT modify:** `app/page.tsx`, `components/BooksPage.tsx`, `components/BookCard.tsx`, any existing file in `lib/`, `app/api/`, or `app/admin/`.

---

## Task 1: Extend DB schema — add `book_covers` table

**Files:**
- Modify: `lib/db/schema.ts`
- Run: `npx drizzle-kit push`

**Step 1: Add the table to schema.ts**

Add at the bottom of `lib/db/schema.ts`:

```ts
export const bookCovers = pgTable('book_covers', {
  bookId:    text('book_id').primaryKey(),
  coverUrl:  text('cover_url'),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
})
```

**Step 2: Push schema to Neon**

```bash
cd /Users/ekoshkin/book-club
npx drizzle-kit push
```

Expected: `[✓] Changes applied` (creates `book_covers` table)

**Step 3: Verify**

```bash
npx drizzle-kit studio
# Or just check that push completed without errors
```

**Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add book_covers table to Drizzle schema"
```

---

## Task 2: Implement `lib/covers.ts`

**Files:**
- Create: `lib/covers.ts`
- Create: `lib/covers.test.ts`

**Step 1: Write the failing tests**

Create `lib/covers.test.ts`:

```ts
import { getInitials } from './covers'

describe('getInitials', () => {
  it('returns two initials for two-word name', () => {
    expect(getInitials('Karl Marx')).toBe('KM')
  })

  it('returns two initials for Russian name', () => {
    expect(getInitials('Иван Иванов')).toBe('ИИ')
  })

  it('returns one initial for single-word name', () => {
    expect(getInitials('Plato')).toBe('P')
  })

  it('returns empty string for empty input', () => {
    expect(getInitials('')).toBe('')
  })
})
```

**Step 2: Run to confirm fail**

```bash
npx jest lib/covers.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './covers'`

**Step 3: Implement `lib/covers.ts`**

```ts
import { db } from '@/lib/db'
import { bookCovers } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'

// Exported for testing
export function getInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export async function getCoverUrls(bookIds: string[]): Promise<Map<string, string | null>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db.select().from(bookCovers).where(inArray(bookCovers.bookId, bookIds))
  return new Map(rows.map(r => [r.bookId, r.coverUrl]))
}

export async function fetchAndCacheCover(
  bookId: string,
  title: string,
  author: string
): Promise<string | null> {
  try {
    const query = new URLSearchParams({ title, author, limit: '1' }).toString()
    const res = await fetch(`https://openlibrary.org/search.json?${query}`)
    let coverUrl: string | null = null

    if (res.ok) {
      const data = await res.json() as { docs?: Array<{ cover_i?: number }> }
      const coverId = data.docs?.[0]?.cover_i
      if (coverId) {
        coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      }
    }

    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl })
      .onConflictDoNothing()

    return coverUrl
  } catch {
    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl: null })
      .onConflictDoNothing()
    return null
  }
}

// Fire-and-forget: trigger cover fetches for books with no DB record
export function triggerMissingCovers(
  books: Array<{ id: string; name: string; author: string }>,
  cachedIds: Set<string>
): void {
  const missing = books.filter(b => !cachedIds.has(b.id))
  if (missing.length === 0) return

  Promise.allSettled(
    missing.map(b => fetchAndCacheCover(b.id, b.name, b.author))
  ).catch(() => {})
}
```

**Step 4: Run tests**

```bash
npx jest lib/covers.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS (4 tests, `getInitials` suite)

**Step 5: Commit**

```bash
git add lib/covers.ts lib/covers.test.ts
git commit -m "feat: add covers lib — Open Library fetch + Postgres cache"
```

---

## Task 3: Implement `lib/books-with-covers.ts`

**Files:**
- Create: `lib/books-with-covers.ts`

No tests needed — this is a thin wrapper that joins two already-tested modules.

**Step 1: Create the file**

```ts
import { fetchBooks, type Book } from '@/lib/sheets'
import { getCoverUrls, triggerMissingCovers } from '@/lib/covers'

export interface BookWithCover extends Book {
  coverUrl: string | null
}

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const books = await fetchBooks(forceRefresh)
  const coverMap = await getCoverUrls(books.map(b => b.id))

  triggerMissingCovers(books, new Set(coverMap.keys()))

  return books.map(b => ({
    ...b,
    coverUrl: coverMap.has(b.id) ? (coverMap.get(b.id) ?? null) : null,
  }))
}
```

**Step 2: TypeScript check**

```bash
cd /Users/ekoshkin/book-club && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 3: Commit**

```bash
git add lib/books-with-covers.ts
git commit -m "feat: add fetchBooksWithCovers — joins Sheets + cover cache"
```

---

## Task 4: New design layout

**Files:**
- Create: `app/new-design/layout.tsx`

**Step 1: Create the layout**

```tsx
import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--nd-sans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  variable: '--nd-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Долгое наступление',
  description: 'Книжный клуб',
}

export default function NewDesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${inter.variable} ${playfair.variable}`}
      style={{
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        background: '#fff',
        color: '#111',
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  )
}
```

**Step 2: Build check**

```bash
cd /Users/ekoshkin/book-club && npm run build 2>&1 | grep -E "error|Error|✓ Compiled" | head -10
```

Expected: no errors

**Step 3: Commit**

```bash
git add app/new-design/layout.tsx
git commit -m "feat: add /new-design layout with Inter + Playfair Display fonts"
```

---

## Task 5: `components/nd/CoverImage.tsx`

**Files:**
- Create: `components/nd/CoverImage.tsx`
- Create: `components/nd/CoverImage.test.tsx`

**Step 1: Write failing tests**

Create `components/nd/CoverImage.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import CoverImage from './CoverImage'

describe('CoverImage', () => {
  it('renders an img tag when coverUrl is provided', () => {
    render(
      <CoverImage
        coverUrl="https://example.com/cover.jpg"
        title="Sapiens"
        author="Yuval Noah Harari"
      />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
    expect(img).toHaveAttribute('alt', 'Обложка: Sapiens')
  })

  it('renders author initials when coverUrl is null', () => {
    render(
      <CoverImage
        coverUrl={null}
        title="Капитал"
        author="Karl Marx"
      />
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('KM')).toBeInTheDocument()
  })

  it('renders initials for Russian author', () => {
    render(
      <CoverImage
        coverUrl={null}
        title="Тест"
        author="Иван Иванов"
      />
    )
    expect(screen.getByText('ИИ')).toBeInTheDocument()
  })
})
```

**Step 2: Run to confirm fail**

```bash
npx jest components/nd/CoverImage.test.tsx --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './CoverImage'`

**Step 3: Implement `components/nd/CoverImage.tsx`**

```tsx
import { getInitials } from '@/lib/covers'

interface Props {
  coverUrl: string | null
  title: string
  author: string
}

export default function CoverImage({ coverUrl, title, author }: Props) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={`Обложка: ${title}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    )
  }

  return (
    <div
      aria-label={`Обложка: ${title}`}
      style={{
        width: '100%',
        height: '100%',
        background: '#F5F5F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '1.5rem',
          color: '#999',
          userSelect: 'none',
        }}
      >
        {getInitials(author)}
      </span>
    </div>
  )
}
```

**Step 4: Run tests**

```bash
npx jest components/nd/CoverImage.test.tsx --no-coverage 2>&1 | tail -10
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/nd/CoverImage.tsx components/nd/CoverImage.test.tsx
git commit -m "feat: add nd/CoverImage — shows cover or author initials fallback"
```

---

## Task 6: `components/nd/BookCard.tsx`

**Files:**
- Create: `components/nd/BookCard.tsx`
- Create: `components/nd/BookCard.test.tsx`

**Step 1: Write failing tests**

Create `components/nd/BookCard.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import BookCard from './BookCard'
import type { BookWithCover } from '@/lib/books-with-covers'

const book: BookWithCover = {
  id: '1',
  name: 'Сапиенс',
  author: 'Юваль Харари',
  tags: ['история', 'наука'],
  description: 'Краткая история человечества',
  date: '1/1/2011',
  pages: '500',
  link: '',
  type: 'Book',
  size: '',
  why: '',
  coverUrl: null,
}

describe('nd/BookCard', () => {
  it('renders book title and author', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('Сапиенс')).toBeInTheDocument()
    expect(screen.getByText('Юваль Харари')).toBeInTheDocument()
  })

  it('shows "Хочу читать" when not selected', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /хочу читать/i })).toBeInTheDocument()
  })

  it('shows "✓ Записан" when selected', () => {
    render(<BookCard book={book} isSelected={true} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /записан/i })).toBeInTheDocument()
  })

  it('calls onToggle with book when button clicked', () => {
    const onToggle = jest.fn()
    render(<BookCard book={book} isSelected={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith(book)
  })

  it('renders tags', () => {
    render(<BookCard book={book} isSelected={false} onToggle={() => {}} />)
    expect(screen.getByText('история')).toBeInTheDocument()
    expect(screen.getByText('наука')).toBeInTheDocument()
  })
})
```

**Step 2: Run to confirm fail**

```bash
npx jest components/nd/BookCard.test.tsx --no-coverage 2>&1 | tail -10
```

Expected: FAIL

**Step 3: Implement `components/nd/BookCard.tsx`**

```tsx
'use client'

import type { BookWithCover } from '@/lib/books-with-covers'
import CoverImage from './CoverImage'

interface Props {
  book: BookWithCover
  isSelected: boolean
  onToggle: (book: BookWithCover) => void
}

function extractYear(date: string): string {
  const parts = date.split('/')
  return parts[parts.length - 1] ?? date
}

export default function BookCard({ book, isSelected, onToggle }: Props) {
  const year = extractYear(book.date)

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #E5E5E5',
        background: '#fff',
      }}
    >
      {/* Cover — 2:3 aspect ratio */}
      <div style={{ aspectRatio: '2/3', width: '100%', overflow: 'hidden' }}>
        <CoverImage coverUrl={book.coverUrl} title={book.name} author={book.author} />
      </div>

      {/* Tags */}
      {book.tags.length > 0 && (
        <div style={{ padding: '0.75rem 0.75rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {book.tags.map(tag => (
            <span
              key={tag}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#999',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Rule */}
      <div style={{ margin: '0.5rem 0.75rem 0', borderTop: '1px solid #111' }} />

      {/* Title + Year */}
      <div style={{ padding: '0.5rem 0.75rem 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <h2
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontWeight: 700,
            fontSize: '1.05rem',
            lineHeight: 1.25,
            color: '#111',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {book.name}
        </h2>
        {year && (
          <span
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.65rem',
              color: '#999',
              whiteSpace: 'nowrap',
              marginTop: '0.2rem',
              flexShrink: 0,
            }}
          >
            {year}
          </span>
        )}
      </div>

      {/* Author */}
      <p
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontStyle: 'italic',
          fontSize: '0.8rem',
          color: '#666',
          margin: '0.25rem 0.75rem 0',
        }}
      >
        {book.author}
      </p>

      {/* Description */}
      {book.description && (
        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.78rem',
            lineHeight: 1.55,
            color: '#666',
            margin: '0.5rem 0.75rem 0',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {book.description}
        </p>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toggle button */}
      <div style={{ padding: '0.75rem' }}>
        <button
          onClick={() => onToggle(book)}
          aria-pressed={isSelected}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.5rem 1rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            border: '1px solid #111',
            background: isSelected ? '#111' : 'transparent',
            color: isSelected ? '#fff' : '#111',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {isSelected ? '✓ Записан' : 'Хочу читать'}
        </button>
      </div>
    </article>
  )
}
```

**Step 4: Run tests**

```bash
npx jest components/nd/BookCard.test.tsx --no-coverage 2>&1 | tail -10
```

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add components/nd/BookCard.tsx components/nd/BookCard.test.tsx
git commit -m "feat: add nd/BookCard — monochrome card with cover image"
```

---

## Task 7: `components/nd/Header.tsx`

**Files:**
- Create: `components/nd/Header.tsx`

No tests — pure presentational UI with session dependency.

**Step 1: Create the component**

```tsx
'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function Header() {
  const { data: session } = useSession()

  return (
    <header
      style={{
        borderBottom: '2px solid #000',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Left: label */}
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#999',
            }}
          >
            Книжный клуб
          </span>
        </div>

        {/* Center: title */}
        <Link
          href="/new-design"
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontSize: '1.25rem',
            color: '#111',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
          }}
        >
          Долгое наступление
        </Link>

        {/* Right: auth */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {session?.user ? (
            <>
              <span
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.7rem',
                  color: '#666',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {session.user.name ?? session.user.email}
              </span>
              <button
                onClick={() => signOut()}
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#111',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #111',
                  cursor: 'pointer',
                  padding: '0 0 1px',
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn('google')}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#111',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                padding: '0 0 1px',
              }}
            >
              Войти
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
```

**Step 2: Commit**

```bash
git add components/nd/Header.tsx
git commit -m "feat: add nd/Header — sticky monochrome header with auth"
```

---

## Task 8: `components/nd/AuthModal.tsx`

**Files:**
- Create: `components/nd/AuthModal.tsx`

No tests — UI-only, mirrors existing `components/AuthModal.tsx` logic with new styles.

**Step 1: Create the component**

```tsx
'use client'

import { signIn } from 'next-auth/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null

  function handleOverlay(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleOverlay}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#fff',
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem 2rem 2rem',
          border: '2px solid #111',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '1rem',
            color: '#999',
            lineHeight: 1,
            padding: '0.2rem',
          }}
        >
          ✕
        </button>

        {/* Label */}
        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#999',
            margin: '0 0 0.75rem',
          }}
        >
          Книжный клуб
        </p>

        {/* Heading */}
        <h2
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontWeight: 700,
            fontSize: '1.5rem',
            color: '#111',
            margin: '0 0 0.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          Войти в клуб
        </h2>

        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.8rem',
            color: '#666',
            margin: '0 0 1.75rem',
            lineHeight: 1.5,
          }}
        >
          войдите, чтобы записаться на книги
        </p>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #111', marginBottom: '1.5rem' }} />

        {/* Google button */}
        <button
          onClick={() => signIn('google')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            width: '100%',
            padding: '0.75rem 1rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            transition: 'background 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="currentColor" opacity="0.85" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="currentColor" opacity="0.7" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="currentColor" opacity="0.6" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="currentColor" opacity="0.55" />
          </svg>
          Войти через Google
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/nd/AuthModal.tsx
git commit -m "feat: add nd/AuthModal — monochrome Google sign-in modal"
```

---

## Task 9: `components/nd/ContactsForm.tsx`

**Files:**
- Create: `components/nd/ContactsForm.tsx`

Mirrors `components/ContactsForm.tsx` logic, new monochrome styles.

**Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'

interface Props {
  defaultName?: string
  defaultContacts?: string
  onSave: (name: string, contacts: string) => Promise<void>
  onClose: () => void
}

export default function ContactsForm({ defaultName = '', defaultContacts = '', onSave, onClose }: Props) {
  const [name, setName] = useState(defaultName)
  const [contacts, setContacts] = useState(defaultContacts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Введите имя'); return }
    setLoading(true)
    setError('')
    try {
      await onSave(name.trim(), contacts.trim())
      onClose()
    } catch {
      setError('Что-то пошло не так, попробуйте снова')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.6rem 0.75rem',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.875rem',
    color: '#111',
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderBottom: '2px solid #111',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '1rem',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666',
    marginBottom: '0.4rem',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem 2rem 2rem',
          border: '2px solid #111',
        }}
      >
        <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#999', margin: '0 0 0.75rem' }}>
          Книжный клуб
        </p>
        <h2 style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.4rem', color: '#111', margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
          {defaultName ? 'Редактировать профиль' : 'Расскажите о себе'}
        </h2>
        <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#666', margin: '0 0 1.5rem' }}>
          {defaultName ? 'Обновите ваши данные' : 'Чтобы организатор знал, с кем связаться'}
        </p>

        <div style={{ borderTop: '1px solid #111', marginBottom: '1.5rem' }} />

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="nd-name" style={labelStyle}>Имя</label>
          <input
            id="nd-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Как вас зовут"
            style={inputStyle}
          />

          <label htmlFor="nd-contacts" style={labelStyle}>Telegram</label>
          <input
            id="nd-contacts"
            type="text"
            value={contacts}
            onChange={e => setContacts(e.target.value)}
            placeholder="@username"
            style={inputStyle}
          />

          {error && (
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#c00', marginBottom: '1rem' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.7rem 1rem',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: loading ? 'default' : 'pointer',
              border: '1px solid #111',
              background: loading ? '#E5E5E5' : '#111',
              color: loading ? '#999' : '#fff',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/nd/ContactsForm.tsx
git commit -m "feat: add nd/ContactsForm — monochrome name + telegram form"
```

---

## Task 10: Main books page

**Files:**
- Create: `components/nd/BooksPage.tsx`
- Create: `app/new-design/page.tsx`

**Step 1: Create `components/nd/BooksPage.tsx`**

This is the interactive client component (parallel to `components/BooksPage.tsx`):

```tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup } from '@/lib/signups'
import { searchBooks } from '@/lib/search'
import Header from './Header'
import BookCard from './BookCard'
import AuthModal from './AuthModal'
import ContactsForm from './ContactsForm'

interface Props {
  books: BookWithCover[]
  currentUser: UserSignup | null
}

async function saveSelection(name: string, contacts: string, books: string[]) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts, selectedBooks: books }),
  })
  if (!res.ok) throw new Error(`Signup failed: ${res.status}`)
}

export default function BooksPage({ books, currentUser }: Props) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user?.email
  const isAdmin = !!session?.user?.isAdmin

  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [selectedBooks, setSelectedBooks] = useState<string[]>(
    currentUser?.selectedBooks ?? []
  )
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showContactsForm, setShowContactsForm] = useState(false)
  const [pendingBook, setPendingBook] = useState<BookWithCover | null>(null)
  const [savedUser, setSavedUser] = useState<{ name: string; contacts: string } | null>(null)
  const effectiveUser = currentUser ?? savedUser

  useEffect(() => {
    if (isLoggedIn && !currentUser && !savedUser && !isAdmin) setShowContactsForm(true)
  }, [isLoggedIn, currentUser, savedUser, isAdmin])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => b.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [books])

  const allAuthors = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => { if (b.author) s.add(b.author) })
    return Array.from(s).sort()
  }, [books])

  const filteredBooks = useMemo(() => {
    let result = searchBooks(books, query) as BookWithCover[]
    if (filterTag) result = result.filter(b => b.tags.includes(filterTag))
    if (filterAuthor) result = result.filter(b => b.author === filterAuthor)
    return result
  }, [books, query, filterTag, filterAuthor])

  function handleToggle(book: BookWithCover) {
    if (!isLoggedIn) {
      setPendingBook(book)
      setAuthModalOpen(true)
      return
    }
    if (!effectiveUser) {
      setPendingBook(book)
      setShowContactsForm(true)
      return
    }

    const next = selectedBooks.includes(book.name)
      ? selectedBooks.filter(n => n !== book.name)
      : [...selectedBooks, book.name]

    setSelectedBooks(next)
    saveSelection(effectiveUser.name, effectiveUser.contacts, next).catch(console.error)
  }

  async function handleSaveContacts(name: string, contacts: string) {
    const booksList = pendingBook
      ? [...selectedBooks, pendingBook.name]
      : selectedBooks
    await saveSelection(name, contacts, booksList)
    setSavedUser({ name, contacts })
    if (pendingBook) {
      setSelectedBooks(booksList)
      setPendingBook(null)
    }
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.75rem',
    color: '#111',
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderBottom: '2px solid #111',
    padding: '0.4rem 0.6rem',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
  }

  return (
    <>
      <Header />

      {/* Search + filters */}
      <div style={{ borderBottom: '1px solid #E5E5E5', background: '#fff' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по названию или автору…"
            style={{
              flex: '1 1 220px',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.8rem',
              color: '#111',
              background: '#fff',
              border: '1px solid #E5E5E5',
              borderBottom: '2px solid #111',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          />
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={selectStyle}>
            <option value="">Тема: все</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} style={selectStyle}>
            <option value="">Автор: все</option>
            {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Grid */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {filteredBooks.length === 0 ? (
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#999', textAlign: 'center', padding: '3rem 0' }}>
            Ничего не найдено
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {filteredBooks.map(book => (
              <BookCard
                key={book.id}
                book={book}
                isSelected={selectedBooks.includes(book.name)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </main>

      {authModalOpen && (
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      )}
      {showContactsForm && (
        <ContactsForm
          defaultName={effectiveUser?.name}
          defaultContacts={effectiveUser?.contacts}
          onSave={handleSaveContacts}
          onClose={() => { setShowContactsForm(false); setPendingBook(null) }}
        />
      )}
    </>
  )
}
```

**Step 2: Create `app/new-design/page.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { getAllSignups } from '@/lib/signups'
import { SessionProvider } from 'next-auth/react'
import BooksPage from '@/components/nd/BooksPage'

export const dynamic = 'force-dynamic'

export default async function NewDesignHome() {
  const [session, books, signups] = await Promise.all([
    auth(),
    fetchBooksWithCovers(),
    getAllSignups().catch(() => []),
  ])

  const currentUser = session?.user?.email
    ? signups.find(s => s.email === session.user!.email) ?? null
    : null

  return (
    <SessionProvider>
      <BooksPage books={books} currentUser={currentUser} />
    </SessionProvider>
  )
}
```

**Step 3: Build check**

```bash
cd /Users/ekoshkin/book-club && npm run build 2>&1 | grep -E "error TS|Error:|✓ Compiled|new-design" | head -15
```

Expected: no errors, `/new-design` listed in routes

**Step 4: Commit**

```bash
git add components/nd/BooksPage.tsx app/new-design/page.tsx
git commit -m "feat: add /new-design main page — monochrome grid with cover images"
```

---

## Task 11: Admin panel for new design

**Files:**
- Create: `components/nd/AdminPanel.tsx`
- Create: `app/new-design/admin/page.tsx`

**Step 1: Create `components/nd/AdminPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { UserSignup } from '@/lib/signups'
import type { BookWithCover } from '@/lib/books-with-covers'
import Header from './Header'

interface BookEntry {
  book: BookWithCover
  users: UserSignup[]
}

interface Props {
  users: UserSignup[]
  byBook: BookEntry[]
}

type View = 'users' | 'books'

const cell: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.8rem',
  color: '#111',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #E5E5E5',
  verticalAlign: 'top',
}

const headCell: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  borderBottom: '2px solid #111',
}

export default function AdminPanel({ users, byBook }: Props) {
  const [view, setView] = useState<View>('users')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      setSyncMsg(res.ok ? 'Синхронизировано' : 'Ошибка синхронизации')
    } catch {
      setSyncMsg('Ошибка синхронизации')
    } finally {
      setSyncing(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0.4rem 0',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #111' : '2px solid transparent',
    color: active ? '#111' : '#999',
    cursor: 'pointer',
    marginRight: '1.5rem',
  })

  return (
    <>
      <Header />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.5rem', color: '#111', margin: 0 }}>
            Панель администратора
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {syncMsg && (
              <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#666' }}>
                {syncMsg}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0.4rem 0.875rem',
                border: '1px solid #111',
                background: syncing ? '#E5E5E5' : 'transparent',
                color: syncing ? '#999' : '#111',
                cursor: syncing ? 'default' : 'pointer',
              }}
            >
              {syncing ? 'Синхронизация…' : 'Sync'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E5E5E5', marginBottom: '1.5rem' }}>
          <button style={tabStyle(view === 'users')} onClick={() => setView('users')}>
            Участники ({users.length})
          </button>
          <button style={tabStyle(view === 'books')} onClick={() => setView('books')}>
            По книгам ({byBook.length})
          </button>
        </div>

        {/* Users table */}
        {view === 'users' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headCell}>Имя</th>
                <th style={headCell}>Telegram</th>
                <th style={headCell}>Email</th>
                <th style={headCell}>Книги</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.userId}>
                  <td style={cell}>{u.name}</td>
                  <td style={cell}>{u.contacts}</td>
                  <td style={{ ...cell, color: '#666' }}>{u.email}</td>
                  <td style={cell}>{u.selectedBooks.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Books table */}
        {view === 'books' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headCell}>Книга</th>
                <th style={headCell}>Автор</th>
                <th style={{ ...headCell, textAlign: 'right' }}>Записались</th>
                <th style={headCell}>Участники</th>
              </tr>
            </thead>
            <tbody>
              {byBook.map(({ book, users: bookUsers }) => (
                <tr key={book.id}>
                  <td style={cell}>{book.name}</td>
                  <td style={{ ...cell, color: '#666', fontStyle: 'italic' }}>{book.author}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{bookUsers.length}</td>
                  <td style={{ ...cell, color: '#666' }}>{bookUsers.map(u => u.name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  )
}
```

**Step 2: Create `app/new-design/admin/page.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import AdminPanel from '@/components/nd/AdminPanel'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function NewDesignAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/new-design')

  const [signups, books] = await Promise.all([getAllSignups(), fetchBooksWithCovers()])

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBooks.includes(book.name)),
    }))
    .filter(b => b.users.length > 0)

  return (
    <SessionProvider>
      <AdminPanel users={signups} byBook={byBook} />
    </SessionProvider>
  )
}
```

**Step 3: Final build check**

```bash
cd /Users/ekoshkin/book-club && npx tsc --noEmit 2>&1 && npm run build 2>&1 | grep -E "error|Error|✓ Compiled|new-design" | head -20
```

Expected: TypeScript clean, `/new-design` and `/new-design/admin` in routes

**Step 4: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -15
```

Expected: all passing

**Step 5: Commit**

```bash
git add components/nd/AdminPanel.tsx app/new-design/admin/page.tsx
git commit -m "feat: add /new-design/admin — monochrome admin panel"
```

---

## Final verification

**TypeScript check:**
```bash
cd /Users/ekoshkin/book-club && npx tsc --noEmit 2>&1 | head -20
```

**All tests pass:**
```bash
npx jest --no-coverage 2>&1 | tail -10
```

**Build succeeds:**
```bash
npm run build 2>&1 | grep -E "error|Error|✓ Compiled|Route|new-design" | head -20
```

**Deploy:**
```bash
npx vercel --prod 2>&1 | tail -8
# Then re-apply alias:
npx vercel alias set <deployment-url> book-club-slow-rising.vercel.app
```

**Manual test checklist:**
- [ ] `/new-design` loads with Inter + Playfair fonts, white background
- [ ] Books show cover images (or initials fallback)
- [ ] Search + tag/author filters work
- [ ] "Хочу читать" toggle works when logged in
- [ ] Auth modal opens when not logged in
- [ ] Contacts form shows for new users
- [ ] `/new-design/admin` requires admin, shows users + books tables
- [ ] Old `/` design is unchanged

# Recommendation Link in Book Card — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Google Sheets column (M) for a recommendation link, parse it, and display it as a hyperlink in `BookCard` below the "Почему предлагаю прочитать" block.

**Architecture:** Raw string `"Text https://url"` is stored in `Book.recommendationLink` from Sheets column M. It is passed through `BookWithCover` unchanged. A helper `parseRecommendationLink` in `BookCard.tsx` splits text from URL and renders a standalone anchor tag, independent of the description expand/collapse state.

**Tech Stack:** Next.js 14, TypeScript, Google Sheets API (googleapis), React

---

## Chunk 1: Data layer — Sheets + BookWithCover

### Task 1: Update `lib/sheets.ts` — new column and interface field

**Files:**
- Modify: `lib/sheets.ts`

- [ ] **Step 1: Update column indexes and range**

In `lib/sheets.ts`, change the `COL` object and range:

```typescript
const COL = {
  NAME: 0, TAGS: 1, AUTHOR: 2, TYPE: 3,
  SIZE: 4, PAGES: 5, DATE: 6, LINK: 7, DESC: 10, WHY_FOR_CLUB: 11, RECOMMENDATION_LINK: 12, COVER: 13
}
```

Change range from `'to read!A:M'` to `'to read!A:N'`.

- [ ] **Step 2: Add field to `Book` interface**

```typescript
export interface Book {
  id: string
  name: string
  tags: string[]
  author: string
  type: string
  size: string
  pages: string
  date: string
  link: string
  description: string
  coverUrl: string | null
  whyForClub: string | null
  recommendationLink: string | null
}
```

- [ ] **Step 3: Update `parseBookRow` to read new column**

Inside the `return { ... }` block of `parseBookRow`, add:

```typescript
recommendationLink: row[COL.RECOMMENDATION_LINK]?.trim() || null,
```

- [ ] **Step 4: Update `TEST_BOOKS` to include the new field**

Add `recommendationLink: null,` to the single object in `TEST_BOOKS`.

- [ ] **Step 5: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/sheets.ts
git commit -m "feat(sheets): добавить колонку recommendationLink (M), Cover → N"
```

---

### Task 2: Update `lib/books-with-covers.ts` — propagate field

**Files:**
- Modify: `lib/books-with-covers.ts`

- [ ] **Step 1: Add field to `BookWithCover` interface**

```typescript
export interface BookWithCover {
  id: string
  name: string
  tags: string[]
  author: string
  type: string
  size: string
  pages: string
  date: string
  link: string
  description: string
  coverUrl: string | null
  whyRead: string | null
  recommendationLink: string | null
  isNew: boolean
  status?: 'reading' | 'read' | null
  signupCount?: number
}
```

- [ ] **Step 2: Add field to `submissionBooks` mapping**

In the `.map(s => ({ ... }))` block for `submissionBooks`, add:

```typescript
recommendationLink: null,
```

- [ ] **Step 3: Verify `sheetsBooks` mapping**

The `sheetsBooks` mapping uses spread `{ ...b, whyRead: b.whyForClub ?? null, isNew: ... }`. Since `Book` now has `recommendationLink`, the field is automatically included via spread. No additional change needed — but verify TypeScript agrees.

- [ ] **Step 4: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/books-with-covers.ts
git commit -m "feat(books): пробросить recommendationLink в BookWithCover"
```

---

## Chunk 2: UI — BookCard rendering

### Task 3: Add `parseRecommendationLink` helper and render in `BookCard.tsx`

**Files:**
- Modify: `components/nd/BookCard.tsx`

- [ ] **Step 1: Add helper function before the component**

After the existing helper functions (`extractYear`, `formatSignupCount`) and before the `BookCard` component definition, add:

```typescript
function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}
```

- [ ] **Step 2: Add recommendation link block in JSX**

Inside the `{/* Description + Why Read */}` section, after the closing `</div>` of the `whyRead` block (after line ~365), and still inside the outer `{(book.description || book.whyRead) && (` condition, add a separate block for the recommendation link.

The full updated section should look like this (replace the entire `{/* Description + Why Read */}` block):

```tsx
{/* Description + Why Read */}
{(book.description || book.whyRead) && (
  <div style={{ margin: '0.5rem 0.75rem 0' }}>
    {book.description && (
      <p
        onClick={hasExpandable ? () => setDescExpanded(e => !e) : undefined}
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.78rem',
          lineHeight: 1.55,
          color: '#666',
          margin: 0,
          cursor: hasExpandable ? 'pointer' : 'default',
          ...(descExpanded ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }),
        }}
      >
        {book.description}
      </p>
    )}
    {hasExpandable && (
      <button
        onClick={() => setDescExpanded(e => !e)}
        style={{
          background: 'none',
          border: 'none',
          padding: '0.25rem 0 0',
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#999',
          cursor: 'pointer',
        }}
      >
        {descExpanded ? 'Свернуть' : 'Читать далее'}
      </button>
    )}
    {(!isLongDescription || descExpanded) && book.whyRead && (
      <div
        style={{
          marginTop: '0.75rem',
          paddingLeft: '0.75rem',
          borderLeft: '2px solid #C0603A',
          background: '#FDF6F3',
          padding: '0.6rem 0.75rem',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#C0603A',
            margin: '0 0 0.3rem',
          }}
        >
          Почему предлагаю прочитать
        </p>
        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontStyle: 'italic',
            fontSize: '0.76rem',
            lineHeight: 1.55,
            color: '#555',
            margin: 0,
          }}
        >
          {book.whyRead}
        </p>
      </div>
    )}
    {book.recommendationLink && (() => {
      const parsed = parseRecommendationLink(book.recommendationLink)
      if (!parsed) return null
      return (
        <p style={{ margin: '0.5rem 0 0', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', color: '#999' }}>
          <a
            href={parsed.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#999', borderBottom: '1px solid #ccc', textDecoration: 'none' }}
          >
            {parsed.text}
          </a>
        </p>
      )
    })()}
  </div>
)}
```

- [ ] **Step 3: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run unit tests**

```bash
npm test
```

Expected: all tests pass (no changes to test files needed — `TEST_BOOKS` has `recommendationLink: null` so the new block won't render in tests).

- [ ] **Step 5: Commit**

```bash
git add components/nd/BookCard.tsx
git commit -m "feat(ui): отображать ссылку на рекомендацию в карточке книги"
```

---

## Chunk 3: Push and verify

### Task 4: Push and check CI

- [ ] **Step 1: Push to remote**

```bash
git push
```

- [ ] **Step 2: Wait for CI to pass**

```bash
gh run list --limit 1
```

Wait for the run to show `completed` / `success`. If it fails, check logs:

```bash
gh run view --log-failed
```

- [ ] **Step 3: Manual verification**

Add a test entry to Google Sheets column M (the new RecommendationLink column) in the format:
`Отзыв А. Замятина https://t.me/zamyatinsk/88`

Open https://www.slowreading.club and verify:
- The link appears below the "Почему предлагаю прочитать" block
- Clicking opens the URL in a new tab
- Books without a value in column M show no link

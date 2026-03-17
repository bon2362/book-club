# Admin Panel — Book Priority Display

**Date:** 2026-03-17
**Status:** Approved

## Overview

Redesign how book priorities are displayed in the admin panel:
- Show each user's book priority ranking directly in the Books column (Участники tab)
- Remove the redundant book filter on the Участники tab
- Show priority rank next to participant names on the По книгам tab
- Re-rank priorities when admin removes a book from a user

## Data Layer (Server Side)

### `admin/page.tsx` changes

Add two queries to the existing `Promise.all`:

1. All `bookPriorities` rows: `db.select({ userId: bookPriorities.userId, bookName: bookPriorities.bookName, rank: bookPriorities.rank }).from(bookPriorities)`. Note: `bookPriorities.userId` is already the pgId (FK to `users.id`), so `bookPrioritiesMap` can be built directly from this query without joining `users`.
2. Extend existing `languageRows` query to the following shape (adding `id` and `prioritiesSet`):
   ```ts
   db.select({ id: users.id, email: users.email, languages: users.languages, prioritiesSet: users.prioritiesSet }).from(users)
   ```

All IDs are `text` (not UUID) per the DB schema.

Build three maps to pass to `AdminPanel`:
- `bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]>` — keyed by `users.id` (pgId), sorted by rank ascending
- `prioritiesSetMap: Record<string, boolean>` — keyed by `users.id` (pgId), built from the extended `languageRows` query using `users.prioritiesSet`
- `emailToPgIdMap: Record<string, string>` — keyed by `users.email`, value is `users.id`; used for lookups when joining signups (where `signup.userId = email`) to priority data

## Участники Tab

### Remove

- Book filter dropdown (`<select>` + bookFilter state)
- "Приоритет" column (only appeared when filter was active)
- All `bookFilter`, `priorityUsers`, `priorityLoading` state
- The `useEffect` that fetches `/api/admin/priorities?book=...`

### Books Column — Badge Redesign (Variant A)

Each book badge shows a colored prefix block with the priority rank:

**User has `prioritiesSet = true`:**
- Ranked books: sorted 1→N, black prefix block with rank number `1`, `2`, `3`...
- Books added after ranking (no entry in `bookPriorities`): appended at end, gray prefix block with `+`

**User has `prioritiesSet = false`:**
- Small gray italic line above badges: "Приоритеты не расставлены"
- All badges show gray prefix block with `?`

**User has no DB row** (signed up via Google Sheets but never authenticated, so no `users` entry exists — `emailToPgIdMap[user.userId]` returns `undefined`):
- Treat the same as `prioritiesSet = false`: show "Приоритеты не расставлены" + `?` badges

Badge HTML structure (variant A):
```
[black/gray block: rank] [book name] [× button]
```

### Sorting Logic (client side)

For each user, sort their `selectedBooks`:
1. Books with a rank entry → sort by rank ascending
2. Books without a rank entry → append after ranked books

## По книгам Tab

### Участники Column

Change from plain `join(', ')` to ranked display:

**Format:** `Алина С.(#1), Мария В.(#2), Борис К.(#4), Иван П.`

- `(#N)` styled as small gray text (font-size: 0.65rem, color: #aaa)
- Users without a rank for this book: shown last, no number
- Sorting: ranked users first (ascending by rank), unranked users last

Data needed: for each book, look up each user's rank from `bookPrioritiesMap` using `emailToPgIdMap[user.userId]`.
Note: in `UserSignup`, the `userId` field stores the user's email (this is how Google Sheets signups work — `userId` = email). Use `user.userId` (not `user.email`) as the key for `emailToPgIdMap` lookups.

## Remove Book → Priority Re-rank

### `/api/admin/remove-book` changes

After removing the book from Google Sheets (existing step), add:

1. Look up `pgId` from `email` (email = `userId` field in sheets signups): query `users` by email
2. If user not found in DB or has no priority entry for this book: skip (no-op)
3. Delete `bookPriorities` row: `DELETE WHERE userId = pgId AND bookName = bookName`
4. Re-rank remaining priorities: `UPDATE bookPriorities SET rank = rank - 1 WHERE userId = pgId AND rank > deletedRank`

This keeps ranks contiguous (no gaps). If user had `[A=1, B=2, C=3]` and B is removed: A stays 1, C becomes 2.

### Client-Side State Update

After successful DELETE, update local priority state so the UI reflects new ranks without a page reload.

Add `localPrioritiesMap` state initialized from `bookPrioritiesMap` prop. Update **after a successful API response** (consistent with existing `handleRemoveBook` pattern — no optimistic update, no rollback).

The API returns `{ ok: true }` (unchanged). The client computes the re-ranked state in JS:

```ts
setLocalPrioritiesMap(prev => {
  const pgId = emailToPgIdMap[userId] // userId in signups = email
  if (!pgId) return prev
  const books = prev[pgId] ?? []
  const removed = books.find(b => b.bookName === bookName)
  if (!removed) return prev
  const updated = books
    .filter(b => b.bookName !== bookName)
    .map(b => b.rank > removed.rank ? { ...b, rank: b.rank - 1 } : b)
  return { ...prev, [pgId]: updated }
})
```

Non-contiguous ranks in the DB (from past bugs) are normalized: after removing rank R, all ranks > R are decremented by 1, which closes any pre-existing gaps relative to R. This normalization is intentional.

## Component Props Changes

```ts
interface Props {
  users: UserSignup[]
  byBook: BookEntry[]
  statuses: Record<string, 'reading' | 'read'>
  allTags: string[]
  tagDescriptions: Record<string, string>
  newFlags: Record<string, boolean>
  userLanguages?: Record<string, string[]>
  // New:
  bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]>
  prioritiesSetMap: Record<string, boolean>
  emailToPgIdMap: Record<string, string>
}
```

## Implementation Subtasks

1. **Server data** — extend `admin/page.tsx` queries; build and pass new maps
2. **Участники UI** — remove filter/state, redesign badge component, sort logic
3. **По книгам UI** — add `(#N)` after names, sort participants by rank
4. **remove-book API** — email→pgId lookup, delete priority row, re-rank
5. **Tests** — update `AdminPanel.test.tsx` to remove assertions about the book filter; add test in `app/api/admin/remove-book/route.test.ts` verifying that after removing a book with rank 2 from a user with 3 ranked books, the DB rank-3 book becomes rank-2 (contiguous re-rank). The new test must mock `@/lib/db` with Drizzle-compatible mock (same pattern as `priorities/route.test.ts` if it mocks the db, otherwise mock the specific db methods called: `select`, `delete`, `update` with chained `.where()` — use `jest.fn()` returning objects with chainable methods)

## Known Limitations

- The По книгам tab is rendered from the `byBook` prop (static server data), not from `localUsers` state. If an admin removes a book from a user, the Участники tab updates instantly (via `localUsers`), but По книгам tab will show stale data until page reload. This is acceptable — consistent with how `byBook` currently works (also not reactive).

## Out of Scope

- The existing `/api/admin/priorities?book=` endpoint is no longer called from the UI (book filter removed), but can remain for potential future use
- No changes to the user-facing priority-setting flow
- No changes to other admin tabs (Теги, Заявки)

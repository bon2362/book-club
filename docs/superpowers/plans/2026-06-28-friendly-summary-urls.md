# Friendly Book Summary URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-curated book slugs, friendly public summary URLs, and a session-aware friendly summary editor after first moderation.

**Architecture:** Store a nullable unique slug on `books`, expose it through existing book and moderation DTOs, and require it for moderation decisions. Resolve public routes by slug with UUID fallback redirects; keep the UUID editor only until a slug exists, then redirect it to the current-user editor nested under the book slug.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM/Postgres, Jest/Testing Library, Playwright.

---

### Task 1: Persist and validate book slugs

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0046_book_slugs.sql`
- Create: `drizzle/0046_book_slugs.test.ts`
- Modify: `lib/books.ts`
- Modify: `lib/books.test.ts`
- Modify: `app/api/test/books/route.ts`
- Modify: `e2e/fixtures.ts`

- [ ] **Step 1: Write failing schema and helper tests**

Add a migration assertion for `"slug" text` and `books_slug_unique`, plus unit cases proving that `normalizeBookSlug('  dolgOE-otstuplenie  ')` returns `dolgoe-otstuplenie` and rejects empty, Cyrillic, doubled/edge hyphens, over-100-character, and invalid-character values.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- drizzle/0046_book_slugs.test.ts lib/books.test.ts --runInBand`

Expected: FAIL because the migration and `normalizeBookSlug` do not exist.

- [ ] **Step 3: Add the column, migration, DTO field, and validation**

Add `slug: text('slug')` and `uniqueIndex('books_slug_unique').on(t.slug)` to `books`. Implement:

```ts
const BOOK_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeBookSlug(value: unknown): string {
  if (typeof value !== 'string') throw new BookValidationError('book slug is required')
  const slug = value.trim().toLowerCase()
  if (!slug) throw new BookValidationError('book slug is required')
  if (slug.length > 100 || !BOOK_SLUG_PATTERN.test(slug)) {
    throw new BookValidationError('book slug must contain lowercase Latin letters, digits, and single hyphens')
  }
  return slug
}
```

Return `slug: row.slug` from `rowToBook`, accept `slug` in the test-book endpoint/fixture, and create SQL that adds the nullable column and unique index.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- drizzle/0046_book_slugs.test.ts lib/books.test.ts --runInBand`

Expected: PASS.

### Task 2: Add slug-aware moderation business rules

**Files:**
- Modify: `lib/book-summaries.ts`
- Modify: `lib/book-summaries.test.ts`
- Modify: `app/api/admin/summaries/[id]/route.ts`
- Modify: `app/api/admin/summaries/[id]/publish/route.ts`
- Modify: `app/api/admin/summaries/[id]/reject/route.ts`
- Modify: `app/api/admin/summary-revisions/[id]/route.ts`
- Modify: `app/api/admin/summary-revisions/[id]/publish/route.ts`
- Modify: `app/api/admin/summary-revisions/[id]/reject/route.ts`
- Modify: relevant route tests beside those handlers

- [ ] **Step 1: Write failing business and route tests**

Cover these behaviors:

```ts
expect(adminRow).toMatchObject({ bookSlug: 'dolgoe-otstuplenie' })
await expect(adminPublishSummary(argsWithoutBookSlug)).rejects.toThrow('book slug is required')
await expect(adminRejectSummary(argsWithoutBookSlug)).rejects.toThrow('book slug is required')
```

Also prove that saving `bookSlug` updates the related `books` row in the same audit context, revisions return the canonical `summaryId`, and HTTP handlers return status 400 for invalid/duplicate slugs.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/book-summaries.test.ts app/api/admin/summaries app/api/admin/summary-revisions --runInBand`

Expected: FAIL on missing `bookSlug` and moderation guards.

- [ ] **Step 3: Implement atomic slug updates and decision guards**

Extend summary and revision row types with `bookSlug`. Select `books.slug` in admin queries. In admin PATCH functions, normalize `patch.bookSlug`, update the related book inside `withAuditContext`, and translate Postgres error `23505` into `SummaryValidationError('book slug already exists')`.

Before publish or reject, load the associated book and enforce:

```ts
if (!bookSlug?.trim()) throw new SummaryValidationError('book slug is required')
```

For reject handlers, persist submitted summary edits (including `bookSlug`) before changing status, and stop if persistence fails.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- lib/book-summaries.test.ts app/api/admin/summaries app/api/admin/summary-revisions --runInBand`

Expected: PASS.

### Task 3: Add the required admin controls and diagnostics

**Files:**
- Modify: `components/nd/AdminPanel.tsx`
- Modify: `components/nd/AdminPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Render a pending summary and assert:

```ts
expect(screen.getByLabelText('Красивый URL книги')).toBeRequired()
expect(screen.getByText('ID саммари')).toBeInTheDocument()
expect(screen.getByText('summary-uuid')).toBeInTheDocument()
```

For a revision, assert both canonical summary ID and revision ID. Mock a failed slug PATCH and assert that publish/reject is not requested and the API error is visible.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- components/nd/AdminPanel.test.tsx --runInBand`

Expected: FAIL because the controls and error handling are absent.

- [ ] **Step 3: Implement the admin UI**

Add `bookSlug: string | null` to `AdminSummary`; render a required token-styled input, `/books/{slug}/summaries` preview, read-only summary ID, and revision ID when applicable. Refactor edit persistence to return success/failure, show the response error, and only continue to publish/reject after a successful save.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- components/nd/AdminPanel.test.tsx --runInBand`

Expected: PASS.

### Task 4: Resolve friendly public and editor routes

**Files:**
- Modify: `lib/books.ts`
- Modify: `lib/books.test.ts`
- Replace: `app/books/[bookId]/summaries/page.tsx` with `app/books/[bookRef]/summaries/page.tsx`
- Create: `app/books/[bookSlug]/my-summary/edit/page.tsx`
- Modify: `app/summaries/[id]/edit/page.tsx`
- Create: route/page helper tests as needed

- [ ] **Step 1: Write failing resolver tests**

Test `fetchBookBySlug`, slug-first resolution, UUID fallback, and current-user summary lookup. Assert that UUID routes call `redirect('/books/dolgoe-otstuplenie/...')` once a slug exists and remain renderable when it does not.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/books.test.ts app/books app/summaries --runInBand`

Expected: FAIL on missing lookup and routes.

- [ ] **Step 3: Implement slug resolution and redirects**

Add `fetchBookBySlug(slug)`. The public route resolves slug first, falls back to ID, and redirects UUID references when `book.slug` exists. The friendly editor authenticates, resolves by slug, then calls `getAuthorSummaryForBook(book.id, session.user.id)`. The legacy editor redirects after loading a book with a slug. These redirects stay non-permanent because an administrator may later edit the slug.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- lib/books.test.ts app/books app/summaries --runInBand`

Expected: PASS.

### Task 5: Use canonical URLs in internal navigation

**Files:**
- Modify: `components/nd/BookCard.tsx`
- Modify: `components/nd/BookCardMobile.tsx`
- Modify: `components/nd/BookRow.tsx`
- Modify: `components/nd/MatchingBookDetailModal.tsx`
- Modify: the matching book-detail data source that selects `books.slug`
- Modify: related component/API tests

- [ ] **Step 1: Write failing link tests**

Assert `/books/dolgoe-otstuplenie/summaries` when `slug` exists and `/books/{id}/summaries` only as a pre-slug fallback. Assert published matching links use the slug.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- components/nd/BookCard.test.tsx components/nd/MatchingBookDetailModal.test.tsx app/api/matching/books --runInBand`

Expected: FAIL because links use IDs.

- [ ] **Step 3: Propagate and use the optional slug**

Build URLs with `book.slug ?? book.id` and extend matching book DTOs/selections with `bookSlug` without changing mutation APIs, which continue using IDs.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same command; expected PASS.

### Task 6: Update E2E coverage and documentation

**Files:**
- Modify: `e2e/book-summaries.spec.ts`
- Modify: `e2e/ui-states.spec.ts`
- Modify: `docs/features/book-summaries.md`
- Modify: `docs/features/books-catalog.md`
- Modify: `docs/wiki/Book-Summaries.md`
- Modify: `docs/wiki/Data-and-Database.md`
- Modify: `docs/wiki/API-and-Swagger.md`
- Modify: `public/openapi.json`

- [ ] **Step 1: Update the existing full-flow E2E test**

Before publication, assert UUID editor usage. In admin review, assert the summary ID, fill `dolgoe-otstuplenie-e2e`, publish, then assert the slug public URL and automatic redirect from both legacy UUID URLs. Log back in as the author and assert `/books/dolgoe-otstuplenie-e2e/my-summary/edit` survives reload.

- [ ] **Step 2: Add the required UI layout assertion**

In `e2e/ui-states.spec.ts`, create a pending summary, open its admin row, and use `boundingBox()` to prove the slug input and immutable summary ID are visible within the expanded moderation panel.

- [ ] **Step 3: Update documentation and OpenAPI**

Document nullable unique `books.slug`, moderation assignment, canonical and fallback routes, required `bookSlug` admin payload/response field, and current-user editor semantics.

- [ ] **Step 4: Run focused E2E**

Run: `npm run test:e2e e2e/book-summaries.spec.ts e2e/ui-states.spec.ts`

Expected: PASS against the isolated E2E Neon branch.

### Task 7: Verify, migrate, and deliver through PR

**Files:** all changed files

- [ ] **Step 1: Run full local verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`

Expected: all commands exit 0.

- [ ] **Step 2: Apply the additive database migration**

Use the `db-migrate` skill with the real Neon `DATABASE_URL`, run `npx drizzle-kit generate` only if the checked-in migration/meta state requires it, then `npx drizzle-kit push`. Confirm only `books.slug` and its unique index change.

- [ ] **Step 3: Commit without bypassing hooks**

Before committing, report `E2E: нужен — ...` and `Wiki: нужна — ...`, then stage the implementation and commit with `feat: add friendly summary URLs`.

- [ ] **Step 4: Push, open PR, enable auto-merge, and monitor**

Push `codex/friendly-summary-urls`, create a PR, enable squash auto-merge, inspect `mergeStateStatus`, update the branch if `BEHIND`, fix failures in the same PR, and continue until the PR is merged into `main`.

# Book Summaries MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP for participant-authored book summaries: Markdown draft editor with autosave, admin moderation, catalog entry points, and public summary pages.

**Architecture:** Add `book_summaries` as a first-class audited table. Keep business rules in `lib/book-summaries.ts`, expose small author/admin route handlers, and integrate the UI through existing profile, catalog, and admin patterns. Render Markdown with `react-markdown` and raw HTML disabled.

**Tech Stack:** Next.js 14 App Router, React 18, NextAuth v5, Drizzle ORM, Neon Postgres, Jest, Playwright, `react-markdown`.

---

## File Structure

- `lib/db/schema.ts`: add `bookSummaries`.
- `drizzle/0044_book_summaries.sql`: create table, indexes, audit trigger.
- `drizzle/0044_book_summaries.test.ts`: migration coverage.
- `lib/audit/audited-tables.ts`: add `book_summaries`.
- `lib/book-summaries.ts`: core server functions, status validation, Markdown summary types, catalog aggregate.
- `lib/book-summaries.test.ts`: TDD for permissions, status transitions, public filtering, admin actions.
- `lib/books.ts` and `lib/books.test.ts`: add `summaryCount`.
- `app/api/summaries/by-book/[bookId]/route.ts`: current-user get/create.
- `app/api/summaries/[id]/route.ts`: author autosave.
- `app/api/summaries/[id]/submit/route.ts`: author submit.
- `app/api/admin/summaries/route.ts`: admin list.
- `app/api/admin/summaries/[id]/route.ts`: admin inline edit.
- `app/api/admin/summaries/[id]/publish/route.ts`: admin publish.
- `app/api/admin/summaries/[id]/reject/route.ts`: admin reject.
- `components/nd/MarkdownToolbar.tsx` and `.test.tsx`: textarea Markdown helper.
- `components/nd/SummaryMarkdown.tsx` and `.test.tsx`: safe Markdown rendering.
- `components/nd/SummaryEditor.tsx` and `.test.tsx`: editor shell, autosave, preview, submit.
- `app/summaries/[id]/edit/page.tsx`: server page for the editor.
- `app/books/[bookId]/summaries/page.tsx`: public summaries page.
- `components/nd/MatchingBookDetailModal.tsx`: show summary action state.
- `components/nd/MatchingPersonalList.tsx` and `components/nd/ProfileDrawer.tsx`: pass summary state into read-book menu where needed.
- `components/nd/BookCard.tsx`, `BookCardMobile.tsx`, `BookRow.tsx`: catalog/list entry point.
- `components/nd/AdminPanel.tsx`: add `summaries` view.
- `public/openapi.json`: document new APIs.
- `docs/features/book-summaries.md`, `docs/wiki/Book-Summaries.md`: technical and owner docs.
- `e2e/book-summaries.spec.ts`: happy path and rejection path.

## Tasks

### Task 1: Database and Audit Foundation

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/audit/audited-tables.ts`
- Create: `drizzle/0044_book_summaries.sql`
- Create: `drizzle/0044_book_summaries.test.ts`

- [ ] Write failing migration tests:
  - assert SQL creates `book_summaries`;
  - assert unique index on `(book_id, author_user_id)`;
  - assert audit trigger exists.
- [ ] Run `npm test drizzle/0044_book_summaries.test.ts` and verify RED.
- [ ] Add schema and migration.
- [ ] Add `book_summaries` to `AUDITED_TABLES`.
- [ ] Run `npm test drizzle/0044_book_summaries.test.ts drizzle/0040_audit_triggers.test.ts` and verify GREEN.

### Task 2: Core Server Library

**Files:**
- Create: `lib/book-summaries.ts`
- Create: `lib/book-summaries.test.ts`

- [ ] Write failing tests for:
  - `normalizeSummaryPatch` trimming fields;
  - create/open requires personal status `read`;
  - create/open returns existing summary;
  - author saves only `draft`/`rejected`;
  - submit validates `displayName`, `title`, `tldr`, `bodyMarkdown`;
  - public list returns only `published`;
  - admin reject requires reason;
  - admin publish clears rejection reason and sets `publishedAt`;
  - catalog count counts only `published`.
- [ ] Run targeted tests and verify RED.
- [ ] Implement `lib/book-summaries.ts` with dependency-injected `dbClient` for tests.
- [ ] Run targeted tests and verify GREEN.

### Task 3: Catalog Aggregate

**Files:**
- Modify: `lib/books.ts`
- Modify: `lib/books.test.ts`

- [ ] Write failing test that `fetchBooksWithCovers` returns `summaryCount` from published summaries only.
- [ ] Verify RED.
- [ ] Add `summaryCount` to `BookWithCover`, aggregate from `bookSummaries`, map into rows.
- [ ] Verify GREEN.

### Task 4: Author and Admin APIs

**Files:**
- Create author/admin route files under `app/api/summaries` and `app/api/admin/summaries`
- Create route tests beside the routes where practical.

- [ ] Write failing route tests for auth, permission checks, author autosave, submit, admin list/edit/publish/reject.
- [ ] Verify RED.
- [ ] Implement routes as thin wrappers around `lib/book-summaries.ts`.
- [ ] Update `public/openapi.json`.
- [ ] Verify GREEN.

### Task 5: Markdown Components and Editor

**Files:**
- Create: `components/nd/MarkdownToolbar.tsx`
- Create: `components/nd/MarkdownToolbar.test.tsx`
- Create: `components/nd/SummaryMarkdown.tsx`
- Create: `components/nd/SummaryMarkdown.test.tsx`
- Create: `components/nd/SummaryEditor.tsx`
- Create: `components/nd/SummaryEditor.test.tsx`
- Create: `app/summaries/[id]/edit/page.tsx`

- [ ] Write failing component tests for toolbar insertion, safe Markdown rendering, autosave debounce, preview toggle, rejected reason display, submit call.
- [ ] Verify RED.
- [ ] Implement components and editor page.
- [ ] Verify GREEN.

### Task 6: Profile Entry Point

**Files:**
- Modify: `components/nd/MatchingBookDetailModal.tsx`
- Modify: `components/nd/MatchingPersonalList.tsx`
- Modify: `components/nd/ProfileDrawer.tsx`
- Add/update related component tests.

- [ ] Write failing tests for menu states: none, draft, pending, rejected, published.
- [ ] Verify RED.
- [ ] Fetch/pass summary state for read books and render correct action.
- [ ] Verify GREEN.

### Task 7: Public Page and Catalog Entry Points

**Files:**
- Create: `app/books/[bookId]/summaries/page.tsx`
- Modify: `components/nd/BookCard.tsx`
- Modify: `components/nd/BookCardMobile.tsx`
- Modify: `components/nd/BookRow.tsx`
- Add/update tests.

- [ ] Write failing tests for summary badges/links and public page 404/no raw HTML.
- [ ] Verify RED.
- [ ] Implement page and badges.
- [ ] Verify GREEN.

### Task 8: Admin UI

**Files:**
- Modify: `components/nd/AdminPanel.tsx`
- Modify: `components/nd/AdminPanel.test.tsx`

- [ ] Write failing tests for `Саммари` tab, filters, inline edit, publish and reject.
- [ ] Verify RED.
- [ ] Implement admin view using existing submission patterns.
- [ ] Verify GREEN.

### Task 9: Docs and E2E

**Files:**
- Create: `docs/features/book-summaries.md`
- Create: `docs/wiki/Book-Summaries.md`
- Create: `e2e/book-summaries.spec.ts`

- [ ] Write E2E happy path and rejection path.
- [ ] Run relevant E2E and verify behavior.
- [ ] Add docs.
- [ ] Run full required verification: `npm run lint`, `npm run typecheck`, `npm test`, targeted E2E.

### Task 10: PR Flow to Production

**Files:** no code files expected.

- [ ] Confirm `pwd` and `git status --short --branch` are in task worktree.
- [ ] Commit implementation without `--no-verify`.
- [ ] Push branch.
- [ ] Create PR.
- [ ] Enable auto-merge squash.
- [ ] Check `mergeStateStatus`; handle `BEHIND`/conflicts immediately.
- [ ] Watch CI in background; on failure, fix in same PR branch.
- [ ] After merge to `main`, report production deploy path and cleanup command for the worktree.

## Self-Review

- Spec coverage: data model, audit, APIs, editor, profile, public page, catalog, admin, docs, OpenAPI, E2E are all mapped.
- TDD: each implementation task begins with failing tests before production code.
- Scope: reactions, comments, `Мои саммари`, WYSIWYG, email notifications, and author editing of published summaries remain out of scope.

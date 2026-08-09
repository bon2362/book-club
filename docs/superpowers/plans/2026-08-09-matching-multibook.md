# Matching Multibook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the one-book-per-session restriction so every participant can hold unlimited hard intents and assignments across distinct books.

**Architecture:** Keep the canonical book model and session-level transaction lock. Change uniqueness from user-per-session to user-per-session-and-book, make all availability checks book-scoped, and centralize conditional-intent cleanup so every assignment source emits the same durable notice and semantic event.

**Tech Stack:** Next.js 14, TypeScript, Drizzle ORM, Neon Postgres, Jest, Playwright.

## Global Constraints

- No reading-capacity field or book limit.
- Hard intent clears all conditional intents immediately but preserves hard intents for other books.
- Any assignment clears remaining conditional intents and creates a durable notice with title snapshots.
- Conditional intent is unavailable while any hard intent exists.
- Participants cannot cancel assignments or leave while assigned; administrators edit assignments by explicit book.
- Circles remain 3–5; formation remains at least 2 hard and 3 total.
- Production migrations are manual and run only after the new runtime is READY.

---

### Task 1: Schema and migration contract

**Files:**
- Create: `drizzle/0061_matching_multibook.sql`
- Create: `drizzle/0061_matching_multibook.test.ts`
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces assignment PK `(sessionId, userId, bookId)` and removes `matching_book_intents_session_user_hard_uniq`.

- [ ] Write a migration test asserting the old hard unique index and assignment PK are dropped before the new three-column PK is added.
- [ ] Run `npm test -- drizzle/0061_matching_multibook.test.ts --runInBand` and confirm RED because migration `0061` does not exist.
- [ ] Add transactional SQL with Drizzle statement breakpoints and update the schema definition.
- [ ] Run the migration test and `drizzle/0040_audit_triggers.test.ts`; confirm both pass and audited tables remain unchanged.

### Task 2: Book-scoped formation and conditional cleanup

**Files:**
- Modify: `lib/matching/book-partition.ts`
- Modify: `lib/matching/__tests__/book-partition.test.ts`
- Modify: `lib/matching/book-transition-db.ts`
- Modify: `lib/matching/__tests__/session-transition-db.test.ts`
- Modify: `lib/matching/matching-event-display.ts`
- Modify: `lib/matching/__tests__/matching-event-display.test.ts`

**Interfaces:**
- `planBookFormation` consumes `assignedToBookUserIds: ReadonlySet<string>`.
- Assignment cleanup returns removed conditional books as `{ bookId, title }[]` per user.
- Notice/event kind is `conditional_intents_cleared` with payload `{ books: string[] }`.

- [ ] Add failing partition tests proving an assignment on another book remains eligible and an assignment on the same book is excluded.
- [ ] Implement the book-scoped formation input and pass the current book's assignments only.
- [ ] Add failing transition tests for multiple hard intents, per-book cancellation, every assignment source, preserved hard intents, notices, and event drafts.
- [ ] Implement a shared conditional-cleanup helper, call it from formation/direct-hard/admin assignment, and preserve hard intents on other books.
- [ ] Add display tests and renderer copy for the new semantic event.
- [ ] Run the targeted matching domain tests until green.

### Task 3: Read model and HTTP contracts

**Files:**
- Modify: `lib/matching/book-public-state.ts`
- Modify: `lib/matching/__tests__/book-public-state.test.ts`
- Modify: `lib/matching/public-state-db.ts`
- Modify: `lib/matching/session-transition.ts`
- Modify: `lib/matching/session-transition-db.ts`
- Modify: `app/api/matching/sessions/[id]/book-actions/route.ts`
- Modify: `app/api/matching/sessions/[id]/book-actions/route.test.ts`
- Modify: `app/api/admin/matching/sessions/[id]/book-admin-actions/route.ts`
- Modify: `app/api/admin/matching/sessions/[id]/book-admin-actions/route.test.ts`

**Interfaces:**
- `viewerAssignmentBookIds: string[]` replaces the singular field.
- `adminParticipants[].assignmentBookIds: string[]` replaces the singular field.
- `cancel_hard`, `admin_unassign_book`, and `admin_place_book_assignment` require `bookId`.

- [ ] Add failing state tests for raw per-book counts, multiple assigned/hard books, allowed actions, sorting pins, and conditional prediction.
- [ ] Key assignments by `userId:bookId`, use sets for assigned/hard books, and remove cross-book availability filtering.
- [ ] Add failing route/action tests for required book IDs and assigned participants continuing to act while leave remains locked.
- [ ] Update action types, parsers, DB predicates, and participant guard rules.
- [ ] Run public-state, route, and transition tests until green.

### Task 4: Participant UI, admin UI, and account merge

**Files:**
- Modify: `components/nd/matching-book-types.ts`
- Modify: `components/nd/MatchingBooksView.tsx`
- Modify: `components/nd/MatchingBooksView.test.tsx`
- Modify: `components/nd/MatchingBookCard.tsx`
- Modify: `components/nd/MatchingBookCard.test.tsx`
- Modify: `components/nd/MatchingBookAdminControls.tsx`
- Modify: `components/nd/MatchingBookAdminControls.test.tsx`
- Modify: `components/nd/MatchingRealtimeClient.tsx`
- Modify: `components/nd/MatchingHeader.tsx`
- Modify: `lib/admin/user-merge.ts`
- Modify: `lib/admin/user-merge.test.ts`

**Interfaces:**
- UI consumes assignment and hard-book sets; there is no switch-confirmation state.
- Admin commands always retain the current `bookId` for unassign/place.
- Account merge unions assignments by `(sessionId, bookId)` and preserves all hard intents after removing duplicates and conditionals.

- [ ] Add failing component tests for two hard cards, plural assignment summary, no observer label, and per-book admin commands.
- [ ] Remove switch UI, render all assignments, keep other cards active, and update intro/notice copy.
- [ ] Add failing merge tests for two distinct assignments, duplicate assignment preference, and multiple hard intents.
- [ ] Implement canonical union rules and run component/merge tests until green.

### Task 5: Migration execution, E2E, contracts, and documentation

**Files:**
- Create: `e2e/integration/matching/multibook-migration.spec.ts`
- Modify: `e2e/matching-books.spec.ts`
- Modify: `e2e/integration/matching/concurrency.spec.ts`
- Modify: `e2e/integration/matching/state-guards.spec.ts`
- Modify: `public/openapi.json`
- Modify: `docs/features/matching.md`
- Modify: `docs/features/testing.md`
- Modify: `docs/wiki/Group-Matching-Mode.md`
- Modify: `docs/wiki/Data-and-Database.md`
- Modify: `docs/wiki/API-and-Swagger.md`

**Interfaces:**
- Migration integration test proves existing rows survive, distinct books for one user succeed, same-book duplicate fails, and audit trigger remains.
- Browser golden path proves two formed assignments survive `page.reload()` and the conditional-cleanup notice is visible.

- [ ] Add the isolated-schema migration test and verify it fails before the E2E database receives `0061`.
- [ ] Apply `0061` only to the guarded E2E Neon branch and run the migration integration test.
- [ ] Rewrite the matching browser journey and request-only concurrency/guard assertions for assignment arrays.
- [ ] Run focused browser and matching integration projects.
- [ ] Update OpenAPI and both documentation audiences, including manual production order: READY runtime first, then `0061`.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test -- --runInBand`, `npm run build`, `git diff --check`, and JSON validation.

### Task 6: Review and PR delivery

**Files:** all PR3 changes.

- [ ] Run one adversarial review and fix Critical/Important findings in the same branch.
- [ ] Re-run the affected checks after the last code change.
- [ ] Commit without `--no-verify`, push, create PR with `Part of #195`, enable squash auto-merge, and monitor CI.
- [ ] Verify production deployment READY, ask the owner to run `node --env-file=.env.local scripts/apply-migration.mjs drizzle/0061_matching_multibook.sql`, verify production read-only, then close issue #195.

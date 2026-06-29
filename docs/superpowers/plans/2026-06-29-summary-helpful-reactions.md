# Summary Helpful Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guest-friendly, account-deduplicated “Полезно” reaction to each published book summary, including persistence, reconciliation after sign-in, audited storage, UI states, and complete delivery documentation.

**Architecture:** Store one active reaction per summary and actor in `book_summary_helpful_reactions`, using `user_id` for accounts and a SHA-256 hash of a scoped first-party guest UUID for anonymous browsers. Route handlers own session/cookie/HTTP behavior while `lib/summary-helpful.ts` owns publication checks, counting, idempotent mutations, and atomic guest-to-account reconciliation under `withAuditContext`. The server-rendered summary page supplies the initial public count; a client button hydrates personalized state, updates optimistically, and rolls back on failure.

**Tech Stack:** Next.js 14 App Router, NextAuth v5, TypeScript, Drizzle ORM, Neon Postgres, Jest/Testing Library, Playwright, OpenAPI 3.0.

---

## File map

- `lib/db/schema.ts`: Drizzle table, XOR check, foreign keys, and partial unique indexes.
- `drizzle/0047_summary_helpful_reactions.sql`: additive table migration, audit trigger, and `visitor_hash` masking in `audit_capture()`.
- `drizzle/0047_summary_helpful_reactions.test.ts`: SQL contract and masking assertions.
- `lib/audit/audited-tables.ts` and `drizzle/0040_audit_triggers.test.ts`: audit registry reconciliation.
- `lib/summary-helpful.ts`: visitor UUID validation/hash, actor union, state/count, idempotent add/remove, and atomic reconcile.
- `lib/summary-helpful.test.ts`: identity, state, dedupe, rollback-facing, and audit-context unit coverage.
- `app/api/summaries/[id]/helpful/{route.ts,route.test.ts}`: personalized GET plus idempotent PUT/DELETE and cookie lifecycle.
- `app/api/summaries/helpful/reconcile/{route.ts,route.test.ts}`: authenticated guest-to-account merge and cookie deletion.
- `components/nd/SummaryHelpfulButton.{tsx,test.tsx}`: hydration, optimistic/pending/error/accessibility behavior.
- `components/nd/SummaryArticle.{tsx,test.tsx}`: reaction footer integration.
- `app/books/[bookSlug]/summaries/{page.tsx,page.test.tsx}`: initial count and session-aware client bootstrap.
- `e2e/fixtures.ts`, `e2e/summary-helpful.spec.ts`, `e2e/ui-states.spec.ts`: isolated published-summary fixture, guest persistence, cleanup, and layout proof.
- `public/openapi.json`: four helpful-reaction operations and schemas.
- `docs/features/book-summaries.md`, `docs/features/audit-log.md`, `docs/wiki/Book-Summaries.md`, `docs/wiki/Privacy-and-User-Data.md`, `content/privacy.md`, `app/privacy/page.tsx`: implementation, owner workflow, audit masking, and privacy disclosures.

### Task 1: Add the audited reaction table and masked migration

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/audit/audited-tables.ts`
- Create: `drizzle/0047_summary_helpful_reactions.sql`
- Create: `drizzle/0047_summary_helpful_reactions.test.ts`
- Modify: `drizzle/0040_audit_triggers.test.ts`

- [ ] **Step 1: Write failing migration and registry tests**

Assert that migration `0047` creates `book_summary_helpful_reactions`, both cascading FKs, the XOR check, partial unique indexes, `audit_book_summary_helpful_reactions`, and a replacement `audit_capture()` branch that removes `visitor_hash` from `before` and `after`. Add `0047` to the concatenated migration list in `0040_audit_triggers.test.ts` and add the table name to `AUDITED_TABLES`, making the reconciliation test fail until SQL exists.

- [ ] **Step 2: Verify RED**

Run: `npm test -- drizzle/0047_summary_helpful_reactions.test.ts drizzle/0040_audit_triggers.test.ts --runInBand`

Expected: FAIL because `0047` and its trigger/masking branch do not exist.

- [ ] **Step 3: Add schema and migration**

Add `check` to the `drizzle-orm/pg-core` imports and define:

```ts
export const bookSummaryHelpfulReactions = pgTable('book_summary_helpful_reactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  summaryId: text('summary_id').notNull().references(() => bookSummaries.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  visitorHash: text('visitor_hash'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  actorCheck: check('book_summary_helpful_reactions_actor_check', sql`num_nonnulls(${t.userId}, ${t.visitorHash}) = 1`),
  summaryUserUnique: uniqueIndex('book_summary_helpful_reactions_summary_user_unique')
    .on(t.summaryId, t.userId).where(sql`${t.userId} IS NOT NULL`),
  summaryVisitorUnique: uniqueIndex('book_summary_helpful_reactions_summary_visitor_unique')
    .on(t.summaryId, t.visitorHash).where(sql`${t.visitorHash} IS NOT NULL`),
}))
```

Create idempotent table/index SQL, replace `audit_capture()` with the current `0041` body plus:

```sql
ELSIF TG_TABLE_NAME = 'book_summary_helpful_reactions' THEN
  v_before := v_before - 'visitor_hash'; v_after := v_after - 'visitor_hash';
```

and attach the new trigger. Keep telemetry suppression from `0041` intact.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- drizzle/0047_summary_helpful_reactions.test.ts drizzle/0040_audit_triggers.test.ts --runInBand`

Expected: PASS.

### Task 2: Implement identity and persistence rules through TDD

**Files:**
- Create: `lib/summary-helpful.ts`
- Create: `lib/summary-helpful.test.ts`

- [ ] **Step 1: Write failing identity tests**

Define the intended exports in tests:

```ts
export type HelpfulActor =
  | { kind: 'user'; userId: string; visitorHash?: string }
  | { kind: 'visitor'; visitorHash: string }
  | { kind: 'new-visitor'; visitorId: string; visitorHash: string }

expect(hashHelpfulVisitorId('550e8400-e29b-41d4-a716-446655440000'))
  .toBe('a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34')
expect(hashHelpfulVisitorCookie('not-a-uuid')).toBeNull()
```

Also test uppercase/brace/non-UUID rejection without logging the supplied value.

- [ ] **Step 2: Verify identity RED, then implement minimal identity helpers**

Run: `npm test -- lib/summary-helpful.test.ts --runInBand`

Expected: FAIL on missing module. Implement strict canonical UUID validation, `createHash('sha256')`, `crypto.randomUUID()`, and constants:

```ts
export const SUMMARY_HELPFUL_COOKIE = '__Secure-summary-helpful'
export const SUMMARY_HELPFUL_COOKIE_PATH = '/api/summaries'
export const SUMMARY_HELPFUL_MAX_AGE = 31_536_000
```

Re-run and expect identity tests PASS.

- [ ] **Step 3: Write failing state/mutation/reconcile tests**

Mock the Drizzle fluent chains and `withAuditContext`. Cover:

- published summary count/state for `null`, visitor, and account actors;
- absent or non-published summary throws `SummaryHelpfulNotFoundError`;
- two PUT-equivalent calls use `onConflictDoNothing()` and return authoritative count/state;
- repeated DELETE returns `reacted: false`;
- account actor with `visitorHash` reconciles before add/remove;
- reconcile loads every guest summary, inserts user rows with conflict ignore, deletes all visitor rows, and returns target state;
- merge conflict collapses two identities to one account reaction;
- every mutation receives `{ source: 'summary-helpful', actorUserId }` in `withAuditContext`.

- [ ] **Step 4: Implement the business API**

Expose exact signatures:

```ts
export interface HelpfulState { count: number; reacted: boolean }
export async function getSummaryHelpfulState(summaryId: string, actor: HelpfulActor | null): Promise<HelpfulState>
export async function addSummaryHelpful(summaryId: string, actor: HelpfulActor): Promise<HelpfulState>
export async function removeSummaryHelpful(summaryId: string, actor: HelpfulActor | null): Promise<HelpfulState>
export async function reconcileSummaryHelpful(summaryId: string, userId: string, visitorHash?: string): Promise<HelpfulState>
export async function getSummaryHelpfulCount(summaryId: string): Promise<number>
```

Use `assertPublishedSummary(summaryId, client)` before returning any state. Mutations execute publication check, optional reconciliation, insert/delete, and final state query in one `withAuditContext` transaction. Inserts use `onConflictDoNothing`; reconciliation remains atomic by querying guest `summary_id`s, inserting each account row with conflict ignore, then deleting all matching guest rows.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- lib/summary-helpful.test.ts --runInBand`

Expected: PASS with publication, idempotency, dedupe, and audit assertions.

### Task 3: Add personalized GET/PUT/DELETE and scoped cookie behavior

**Files:**
- Create: `app/api/summaries/[id]/helpful/route.ts`
- Create: `app/api/summaries/[id]/helpful/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock `auth()` and the business functions. Prove:

- GET without session/cookie passes `null`, returns `{ count, reacted:false }`, sets no cookie;
- GET with valid cookie hashes it, refreshes the same cookie, and returns `Cache-Control: private, no-store`;
- invalid cookie is ignored and not refreshed;
- first guest PUT creates a new visitor actor and sets the cookie only after `addSummaryHelpful` resolves;
- failed guest PUT sets no cookie;
- authenticated PUT/DELETE include `userId` and optional `visitorHash`;
- repeated DELETE without a cookie is still successful;
- `SummaryHelpfulNotFoundError` maps to 404 and unexpected errors map to a generic 500 without echoing cookie/hash.

- [ ] **Step 2: Verify RED**

Run: `npm test -- 'app/api/summaries/[id]/helpful/route.test.ts' --runInBand`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement the route and cookie writer**

Build actors from `session.user.id` and the validated cookie. Set or refresh only after a successful business call:

```ts
response.cookies.set(SUMMARY_HELPFUL_COOKIE, visitorId, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: SUMMARY_HELPFUL_COOKIE_PATH,
  maxAge: SUMMARY_HELPFUL_MAX_AGE,
})
response.headers.set('Cache-Control', 'private, no-store')
```

GET never creates an identity. PUT creates one only for a successful first guest reaction. DELETE with no identity still asks the business layer for a published-summary state.

- [ ] **Step 4: Verify GREEN**

Run the same Jest command; expected PASS.

### Task 4: Add authenticated atomic reconciliation endpoint

**Files:**
- Create: `app/api/summaries/helpful/reconcile/route.ts`
- Create: `app/api/summaries/helpful/reconcile/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Cover 401 without `session.user.id`, 400 for missing/empty `summaryId`, successful reconciliation with a valid guest cookie, invalid-cookie fallback to account state, 404 for unpublished summary, and transaction failure preserving the cookie. On success with a valid cookie, assert deletion uses the original scoped path:

```ts
expect(response.cookies.get(SUMMARY_HELPFUL_COOKIE)).toMatchObject({
  value: '', path: '/api/summaries', maxAge: 0,
})
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- app/api/summaries/helpful/reconcile/route.test.ts --runInBand`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement and verify GREEN**

Parse JSON defensively, require the session, call `reconcileSummaryHelpful(summaryId, userId, visitorHash)`, and expire the cookie only after success. Return `private, no-store` for personalized state.

Run the same command; expected PASS.

### Task 5: Build the accessible optimistic button and article footer

**Files:**
- Create: `components/nd/SummaryHelpfulButton.tsx`
- Create: `components/nd/SummaryHelpfulButton.test.tsx`
- Modify: `components/nd/SummaryArticle.tsx`
- Modify: `components/nd/SummaryArticle.test.tsx`

- [ ] **Step 1: Write failing component tests**

Use Testing Library with a deferred `fetch` mock. Assert:

- initial zero label is exactly `Полезно`, positive label is `Полезно · N`;
- before personalized state resolves, button is disabled and `aria-busy="true"`;
- guest hydrates through GET, account hydrates through reconcile and falls back to GET on reconcile error;
- click immediately toggles `aria-pressed`, label, and count by ±1;
- pending blocks a second request;
- successful response replaces optimistic values with authoritative `{ count, reacted }`;
- failed request rolls back and displays `Не получилось. Попробуйте ещё раз.`;
- `SummaryArticle` forwards `summaryId`, `initialHelpfulCount`, and `hasSession`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/nd/SummaryHelpfulButton.test.tsx components/nd/SummaryArticle.test.tsx --runInBand`

Expected: FAIL because button props/component are absent.

- [ ] **Step 3: Implement the client component and footer**

Use `'use client'`, local `count/reacted/loading/error`, abort-safe hydration, and previous-state rollback. Render a token-only footer after `SummaryMarkdown`:

```tsx
<footer data-testid="summary-helpful-footer" style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
  <button aria-pressed={reacted} aria-busy={pending || hydrating} disabled={pending || hydrating}>...</button>
  {error ? <span role="alert">Не получилось. Попробуйте ещё раз.</span> : null}
</footer>
```

Inactive uses a line/button treatment; active uses existing `var(--text)`/`var(--bg)` tokens. Do not add literal colors, shadows, rounded corners, or PostHog calls.

- [ ] **Step 4: Verify GREEN**

Run the same command; expected PASS.

### Task 6: Supply server count and switch state per summary

**Files:**
- Modify: `app/books/[bookSlug]/summaries/page.tsx`
- Modify: `app/books/[bookSlug]/summaries/page.test.tsx`

- [ ] **Step 1: Write failing page tests**

Mock `auth`, `getSummaryHelpfulCount`, and `SummaryArticle`. Render two active-author cases and assert the page requests the active `summary.id`, passes its count, and passes `hasSession=true` only when `session.user.id` exists. Preserve existing slug/UUID redirect tests.

- [ ] **Step 2: Verify RED**

Run: `npm test -- 'app/books/[bookSlug]/summaries/page.test.tsx' --runInBand`

Expected: FAIL on missing count/session integration.

- [ ] **Step 3: Implement and verify GREEN**

After selecting `active`, load count and session concurrently where possible, then pass:

```tsx
summaryId={active.id}
initialHelpfulCount={helpfulCount}
hasSession={Boolean(session?.user?.id)}
```

Run the same command; expected PASS.

### Task 7: Add isolated Playwright persistence and layout coverage

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/summary-helpful.spec.ts`
- Modify: `e2e/ui-states.spec.ts`

- [ ] **Step 1: Add a cleanup-backed published summary fixture**

Define `createPublishedSummary` that depends on `createTestBook` and `dbExec`, creates a uniquely identified E2E author plus published `book_summaries` row only in the guarded Neon E2E branch, returns `{ id, bookSlug, url }`, and registers deletion of the author/summary. Book teardown plus `ON DELETE CASCADE` removes reactions even if the assertion fails.

- [ ] **Step 2: Add the required guest persistence scenario**

Implement exactly:

```ts
await page.goto(summary.url)
await expect(helpful).toHaveText('Полезно')
await helpful.click()
await expect(helpful).toHaveAttribute('aria-pressed', 'true')
await expect(helpful).toHaveText('Полезно · 1')
await page.reload()
await page.waitForLoadState('networkidle')
await expect(helpful).toHaveAttribute('aria-pressed', 'true')
await helpful.click()
await page.reload()
await page.waitForLoadState('networkidle')
await expect(helpful).toHaveText('Полезно')
```

Also assert no `· 0` and cookie path/name through browser context cookies.

- [ ] **Step 3: Add layout proof in `ui-states.spec.ts`**

Create a published summary, locate the article body and reaction footer, and use `boundingBox()` to prove `footer.y >= body.y + body.height`, the footer is within the article width, and hydration does not move the footer by more than one pixel when the public count is unchanged.

- [ ] **Step 4: Apply migration to E2E and run focused Playwright**

Load `DATABASE_URL` from the existing `.env.test.local` without printing it. Apply `drizzle/0047_summary_helpful_reactions.sql` using `node scripts/apply-migration.mjs`, then run:

`npm run test:e2e e2e/summary-helpful.spec.ts e2e/ui-states.spec.ts`

Expected: PASS against the guarded isolated Neon branch, with fixture cleanup.

### Task 8: Publish the HTTP, implementation, owner, audit, and privacy contracts

**Files:**
- Modify: `public/openapi.json`
- Modify: `docs/features/book-summaries.md`
- Modify: `docs/features/audit-log.md`
- Modify: `docs/wiki/Book-Summaries.md`
- Modify: `docs/wiki/Privacy-and-User-Data.md`
- Modify: `content/privacy.md`
- Modify: `app/privacy/page.tsx`

- [ ] **Step 1: Update OpenAPI**

Add GET/PUT/DELETE `/api/summaries/{id}/helpful` and POST `/api/summaries/helpful/reconcile`, shared `{ count: integer >= 0, reacted: boolean }`, `{ summaryId: string }`, 400/401/404/500 responses, personalized `no-store` behavior, and scoped cookie descriptions. Validate with `node -e "JSON.parse(require('fs').readFileSync('public/openapi.json','utf8'))"`.

- [ ] **Step 2: Update technical and owner documentation**

Document table constraints, actor identity, publication guard, four routes, cookie lifecycle, merge semantics, audit source/masking, cleanup cascades, no CAPTCHA/fingerprinting/PostHog in v1, and operational rollback.

- [ ] **Step 3: Update privacy policy and effective date**

State that the first-party HttpOnly reaction cookie is scoped to `/api/summaries`, lasts 12 months from the last summary-reaction API use, stores a random UUID only in the browser while Neon receives SHA-256, can be used to remove the guest reaction, and is merged into/deleted with the account after sign-in/account deletion. Update `EFFECTIVE_DATE` to `29 июня 2026`.

### Task 9: Verify, migrate, commit, and deliver through the protected PR flow

**Files:** all changed files

- [ ] **Step 1: Run focused and full verification**

Run in the task-worktree:

```bash
npm run lint
npm run typecheck
npm test -- lib/summary-helpful.test.ts 'app/api/summaries/[id]/helpful/route.test.ts' app/api/summaries/helpful/reconcile/route.test.ts components/nd/SummaryHelpfulButton.test.tsx components/nd/SummaryArticle.test.tsx 'app/books/[bookSlug]/summaries/page.test.tsx' drizzle/0047_summary_helpful_reactions.test.ts drizzle/0040_audit_triggers.test.ts --runInBand
npm test -- --runInBand
npm run test:e2e e2e/summary-helpful.spec.ts
npm run test:e2e e2e/ui-states.spec.ts
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Apply and verify the additive production migration**

Use the repository migration runner with `DATABASE_URL` loaded from the existing production environment without printing or modifying `.env.local`. Apply `0047` before enabling live UI and verify through metadata queries that the table, two partial unique indexes, XOR check, and audit trigger exist. Insert no production reaction rows.

- [ ] **Step 3: Commit without bypassing hooks**

Before the commit, report:

`E2E: нужен — новый UI-флоу меняет персистентное состояние; покрыт guest toggle + page.reload и layout boundingBox.`

`Wiki: нужна — меняются пользовательская фича, БД, API, cookie/privacy и audit workflow.`

Stage only task-worktree files and commit with `feat: add helpful summary reactions`. Never use `--no-verify`.

- [ ] **Step 4: Push one PR and enable auto-merge**

Push `feat/summary-helpful-reactions`, create one PR referencing `#426`, run `gh pr merge --auto --squash --delete-branch`, and immediately inspect `mergeStateStatus`/`mergeable`. If `BEHIND`, run `gh pr update-branch`; if CI fails, fix and push to the same branch.

- [ ] **Step 5: Wait for actual merge and verify production safely**

Poll CI/PR asynchronously until merged. Verify the Vercel production deployment for the squash commit is READY, then perform read-only live checks: homepage responds, a known published summary page renders, GET helpful returns personalized no-store state without creating a cookie when the browser has none, and no production data is mutated.

- [ ] **Step 6: Close Issue #426**

After merge and production verification, close #426 with a comment containing PR URL and squash commit. Record the removable worktree path `/Users/ekoshkin/book-club-summary-helpful-reactions`.

## Self-review record

- **Spec coverage:** Sections 1–3 map to Tasks 2/5/6; cookie and hashing (4) to Tasks 2–4; schema (5) to Task 1; business and API (6–7) to Tasks 2–4; server/client flow (8) to Tasks 5–6; audit/privacy (9) to Tasks 1/8; concurrency/errors (10) to Tasks 2–4; all required test layers (11) to Tasks 1–7/9; docs/supply (12) to Tasks 8–9; every readiness criterion (13) has a verification in Tasks 7–9.
- **Placeholder scan:** No placeholder markers, deferred implementation, unnamed error handling, or unspecified test steps remain. Commands, expected outcomes, files, exported types, cookie attributes, error states, and rollout checks are explicit.
- **Type consistency:** `HelpfulActor`, `HelpfulState`, `summaryId`, `visitorHash`, `initialHelpfulCount`, and `hasSession` retain identical names across business, routes, page, article, and button. `count/reacted` is the only public response shape; `summaryId` is the reconcile request shape.
- **Scope check:** One cohesive vertical feature; schema, API, UI, docs, and rollout are not independently shippable without violating the approved contract, so a single plan and PR are appropriate.

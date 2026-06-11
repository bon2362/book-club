# Admin User Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a safe audited tool to merge duplicate users into one canonical user.

**Architecture:** Put merge rules in a pure planner/service layer, keep the API thin, and execute all DB mutations inside one `withAuditContext({ source: 'admin', reason })` transaction. Add a summary `user_merge_events` table so the audit viewer shows a readable high-level merge event.

**Tech Stack:** Next.js route handlers, Drizzle, Postgres migrations, audit triggers, Jest, Playwright admin e2e.

---

## File Structure

- Modify `lib/db/schema.ts`: add `userMergeEvents`.
- Modify `lib/audit/audited-tables.ts`: add `user_merge_events`.
- Create migration `drizzle/0043_user_merge_events.sql` if the latest migration is still `0042`; otherwise use the next sequential migration number from the PR3 branch.
- Create `lib/admin/user-merge.ts`: validation, preview, merge execution helpers.
- Create `lib/admin/user-merge.test.ts`: pure merge-rule coverage.
- Create `app/api/admin/users/merge/route.ts` and test file.
- Modify `lib/admin-users.ts`: include identities in user details if not already added by PR2.
- Modify `components/nd/AdminUserDrawer.tsx` and `components/nd/AdminPanel.tsx`: merge UI and refresh.
- Update docs and wiki listed in the design spec.

## Task 1: Merge Event Table

- [ ] Add schema tests or extend audit trigger reconciliation expectations for `user_merge_events`.
- [ ] Run `npm test -- drizzle/0040_audit_triggers.test.ts` and confirm failure before migration/registry update.
- [ ] Add `userMergeEvents` table with columns: `id`, `occurredAt`, `actorUserId`, `sourceUserId`, `targetUserId`, `reason`, `sourceSnapshot`, `targetSnapshot`, `movedCounts`.
- [ ] Add SQL migration creating the table and audit trigger.
- [ ] Add `user_merge_events` to `AUDITED_TABLES`.
- [ ] Re-run reconciliation test.

## Task 2: Pure Merge Rules

- [ ] Create tests for:
  - signup merge keeps earliest `signedAt`;
  - personal status resolves `read > reading > null`;
  - priority merge keeps target order first and appends source-only books by source rank;
  - identity provider/account conflicts abort;
  - self-merge and missing reason are invalid.
- [ ] Run `npm test -- lib/admin/user-merge.test.ts` and confirm failure.
- [ ] Implement pure helpers in `lib/admin/user-merge.ts`: `resolveSignupMerge`, `mergePriorityRows`, `validateMergeRequest`.
- [ ] Re-run tests.

## Task 3: DB Merge Service

- [ ] Add mocked service tests for the order of table operations and conflict responses.
- [ ] Implement `mergeUsers(tx, input)`:
  - load source and target;
  - check identity conflicts;
  - move identities and dependent rows;
  - merge signups and priorities with pure helpers;
  - reassign matching/session/activity/submission/feedback rows;
  - insert `user_merge_events`;
  - delete source user.
- [ ] Keep all mutations inside the tx provided by the route.

## Task 4: Admin API

- [ ] Add route tests for 401/403, 400 invalid body, 404 missing user, 409 identity conflict, and 200 success.
- [ ] Implement `POST /api/admin/users/merge` with `withAuditContext({ actorUserId, actorLabel, source: 'admin', reason })`.
- [ ] Re-run route tests.

## Task 5: Admin UI

- [ ] Add UI tests or e2e coverage for selecting target, entering reason, previewing counts, confirming merge, and refreshing user list.
- [ ] Modify `AdminUserDrawer.tsx` to expose "Слить дубль".
- [ ] Modify `AdminPanel.tsx` to own modal state, call merge endpoint, refresh users, and close source drawer after success.
- [ ] Use design tokens only; no new raw hex.

## Task 6: E2E, Docs, Commit

- [ ] Read `docs/features/testing.md`.
- [ ] Add Playwright admin flow covering merge persistence after `page.reload()`.
- [ ] Update `docs/features/auth.md`, `docs/features/admin-panel.md`, `docs/features/audit-log.md`, `docs/wiki/Auth-and-Users.md`, `docs/wiki/Admin-Panel.md`, `docs/wiki/Data-and-Database.md`, and `docs/wiki/Privacy-and-User-Data.md`.
- [ ] Before commit, print:
  - `E2E: нужен — новый админский UI-flow меняет persistent state`;
  - `Wiki: нужна — меняется admin workflow, DB schema, audit и privacy/data handling`.
- [ ] Run `npm run lint && npm run typecheck && npm test`.
- [ ] Run the new/updated admin e2e file.
- [ ] Commit with `feat(admin): #366 — слияние дублей пользователей`.

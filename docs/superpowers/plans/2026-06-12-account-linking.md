# Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user attach additional auth identities to the same account.

**Architecture:** Reuse `user_identities` and `linkIdentityToUser`, but add an audit-aware linking wrapper for profile-initiated mutations. Expose current identities via `/api/me`, add provider-specific link endpoints, and surface them in `ProfileDrawer`.

**Tech Stack:** Next.js route handlers, NextAuth session, Drizzle, Resend/Google verification, Telegram HMAC, Jest, Playwright.

---

## File Structure

- Modify `lib/user-identities.ts`: expose tx-capable link helper or add `linkIdentityToUserWithDb`.
- Create `lib/account-linking.ts`: provider-safe linking orchestration and response shapes.
- Modify `app/api/me/route.ts`: return full identities list.
- Create `app/api/account/identities/google/route.ts`.
- Create `app/api/account/identities/email/request/route.ts`.
- Create `app/api/account/identities/email/confirm/route.ts`.
- Create `app/api/account/identities/telegram/state/route.ts` and `app/api/account/identities/telegram/callback/route.ts`.
- Modify `components/nd/ProfileDrawer.tsx`: `Способы входа` section.
- Update docs and wiki listed in the design spec.

## Task 1: Identity Listing

- [ ] Extend `app/api/me/route.test.ts` so identities are returned as an ordered array, including `provider`, `email`, `telegramUsername`, and ISO `lastSeenAt`.
- [ ] Run `npm test -- app/api/me/route.test.ts` and confirm failure.
- [ ] Modify `app/api/me/route.ts` to select all identities for `session.user.id`, ordered by `lastSeenAt desc`, and keep existing `authProvider`/`lastSignInAt` compatibility fields from the first row.
- [ ] Re-run the test.

## Task 2: Audit-Aware Link Helper

- [ ] Add unit tests in `lib/user-identities.test.ts` for linking inside a provided transaction without opening a nested transaction.
- [ ] Run the specific test and confirm failure.
- [ ] Refactor `lib/user-identities.ts` so the internal link implementation accepts a db/tx object. Preserve the public `linkIdentityToUser(...)` API.
- [ ] Add `linkIdentityToUserInTx(tx, userId, provider, providerAccountId, profile)` export for audited routes.
- [ ] Re-run identity tests.

## Task 3: Google Linking Endpoint

- [ ] Add route tests for `POST /api/account/identities/google`: 401 without session, 400 without credential, 409 when identity belongs to another user, 200 when linked.
- [ ] Run and confirm failure.
- [ ] Implement the route by verifying the Google credential with the existing Google One Tap verification logic or shared verifier, then call `withAuditContext({ source: 'profile' })` and `linkIdentityToUserInTx`.
- [ ] Re-run route tests.

## Task 4: Email Linking Endpoint

- [ ] Add tests for request/confirm token lifecycle: authenticated request, invalid token, token for different user, successful confirm.
- [ ] Implement signed token helpers using `AUTH_SECRET || NEXTAUTH_SECRET`, short expiry, and no DB table unless needed.
- [ ] Send email through Resend with text explaining this links an email to the current account.
- [ ] Confirm route links `provider='email'` through audit context.

## Task 5: Telegram Linking Endpoint

- [ ] Read `docs/features/auth.md`.
- [ ] Add route tests around signed state creation and callback HMAC validation.
- [ ] Implement state route requiring current session.
- [ ] Implement callback route separate from sign-in callback; it validates Telegram HMAC and signed state, then links the Telegram identity to the state user id inside audit context.
- [ ] Redirect to `/` with success/failure query parameters that `ProfileDrawer` can display.

## Task 6: Profile UI

- [ ] Add/extend component tests for visible linked identities and missing-provider actions.
- [ ] Modify `ProfileDrawer.tsx` to render identities from `/api/me`.
- [ ] Show conflicts and success messages.
- [ ] Keep UI token-compliant: no raw color literals added; use `var(--*)` tokens.

## Task 7: E2E, Docs, Commit

- [ ] Run provider route tests and relevant auth tests.
- [ ] Run `npm run test:e2e e2e/telegram-auth.spec.ts` if Telegram route/widget test infrastructure works locally; otherwise document route-level coverage and run `npm run test:e2e e2e/ui-states.spec.ts` for the profile UI state.
- [ ] Update `docs/features/auth.md`, `docs/wiki/Auth-and-Users.md`, `docs/wiki/Data-and-Database.md`, and `docs/wiki/Privacy-and-User-Data.md`.
- [ ] Before commit, print:
  - `E2E: нужен — меняется auth chain и persistent linking flow`;
  - `Wiki: нужна — меняется auth/session/provider логика и privacy/data handling`.
- [ ] Run `npm run lint && npm run typecheck && npm test`.
- [ ] Commit with `feat(auth): #366 — привязка способов входа`.

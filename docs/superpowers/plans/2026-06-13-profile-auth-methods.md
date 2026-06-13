# Profile Auth Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the ProfileDrawer "Способы входа" area to show linked Telegram/Google/email methods from `user_identities` without adding unlink support.

**Architecture:** `/api/me` returns a compact `authMethods` array derived from all current `user_identities` rows for the session user, plus the existing latest `authProvider`. `ProfileDrawer` renders three canonical providers with linked/unlinked states, a clear last-login badge, and a Telegram fallback label when no username exists. Linking CTAs reuse the existing sign-in entry points where safe.

**Tech Stack:** Next.js 14 route handlers, Drizzle ORM, NextAuth session data, React client component, Jest, Playwright layout test.

---

### Task 1: Extend `/api/me` Data Shape

**Files:**
- Modify: `app/api/me/route.ts`
- Test: `app/api/me/route.test.ts`

- [ ] Write a failing test asserting `GET /api/me` returns all identities as `authMethods`, preserving latest `authProvider`.
- [ ] Run `npm test -- --runInBand app/api/me/route.test.ts` and confirm the new assertion fails because `authMethods` is missing.
- [ ] Implement a single identity query without `.limit(1)`, returning `{ provider, providerAccountId, email, telegramUsername, lastSeenAt }` for each method.
- [ ] Map rows into API-safe `authMethods` objects and keep `authProvider`/`lastSignInAt` from the first row.
- [ ] Run the route test again and confirm it passes.

### Task 2: Redesign ProfileDrawer Auth Methods

**Files:**
- Modify: `components/nd/ProfileDrawer.tsx`
- Test: existing component/API tests plus e2e layout test

- [ ] Inspect current `ProfileDrawer` user typing and `effectiveUser` load path.
- [ ] Add `authMethods` typing to the user payload.
- [ ] Add provider metadata and small icon renderers near ProfileDrawer helpers.
- [ ] Replace the old footer auth row (`icon + contactEmail/— + Выйти`) with a dedicated "Способы входа" section above sign-out/delete controls.
- [ ] Render Telegram account detail as `@username` when available, otherwise `Telegram ID привязан`; never render a dash for a linked Telegram method.
- [ ] Render unlinked Google/email rows with `не привязан` and a `Привязать` CTA; do not add unlink controls.
- [ ] Keep sign-out as a separate plain footer action.

### Task 3: UI Layout Coverage and Docs

**Files:**
- Modify: `e2e/ui-states.spec.ts`
- Modify: `docs/features/auth.md`
- Modify: `docs/wiki/Auth-and-Users.md`
- Modify: `docs/wiki/Privacy-and-User-Data.md` if data display changes need privacy wording

- [ ] Add/update a Playwright test for ProfileDrawer auth methods: the section is visible, Telegram linked without username shows `Telegram ID привязан`, no lower dash appears, and no unlink button exists.
- [ ] Run unit tests, lint, typecheck, and attempt the targeted e2e test.
- [ ] Update feature/wiki docs to mention profile auth methods display and that unlinking is intentionally out of scope.

### Task 4: PR Flow

**Files:** all changed files

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Attempt `npm run test:e2e e2e/ui-states.spec.ts` and record outcome.
- [ ] Commit with the required E2E/Wiki checklist.
- [ ] Push, create PR, enable auto-merge, watch CI, verify merge, Wiki Sync, and Vercel production.


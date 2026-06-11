# Auth Login Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "последний способ входа" badge in `AuthModal` based on non-PII browser-local provider memory.

**Architecture:** Keep auth truth on the server and use local storage only as a UI hint. Add a small client helper for provider validation/storage, call it from an authenticated client surface after session is available, and render the badge inside the existing modal.

**Tech Stack:** Next.js 14, React client components, Jest, Playwright, project CSS tokens.

---

## File Structure

- Create `components/nd/auth-provider-memory.ts`: validates `google | telegram | email`, reads/writes `localStorage`.
- Create `components/nd/auth-provider-memory.test.ts`: node/jsdom-safe unit tests for validation and storage.
- Modify `components/nd/AuthModal.tsx`: read remembered provider on open, auto-expand secondary methods for Google/email, render token badge.
- Modify `components/nd/BooksPage.tsx`: persist `session.user.provider` when logged in.
- Modify `e2e/ui-states.spec.ts`: add layout/visibility coverage for the auth hint by seeding localStorage.
- Modify `docs/features/auth.md`, `docs/wiki/Auth-and-Users.md`, and `docs/wiki/Privacy-and-User-Data.md`.

## Task 1: Provider Memory Helper

- [ ] Write failing tests in `components/nd/auth-provider-memory.test.ts`:
  - invalid values return `null`;
  - valid providers round-trip through a mocked storage object;
  - storage exceptions return `null` or no-op.
- [ ] Run `npm test -- components/nd/auth-provider-memory.test.ts` and confirm tests fail because the module does not exist.
- [ ] Implement `components/nd/auth-provider-memory.ts` with:
  - `AUTH_PROVIDER_MEMORY_KEY = 'slowreading.lastAuthProvider'`;
  - `type RememberedAuthProvider = 'google' | 'telegram' | 'email'`;
  - `normalizeRememberedAuthProvider(value: unknown): RememberedAuthProvider | null`;
  - `readRememberedAuthProvider(storage = globalThis.localStorage): RememberedAuthProvider | null`;
  - `writeRememberedAuthProvider(provider, storage = globalThis.localStorage): void`.
- [ ] Re-run the same Jest command and confirm it passes.

## Task 2: Auth Modal Badge

- [ ] Add/extend component tests for `AuthModal` using React Testing Library:
  - when localStorage contains `telegram`, the Telegram area shows `последний способ входа`;
  - when localStorage contains `google`, secondary methods are visible without pressing "Войти другим способом" and the Google button shows the badge;
  - when localStorage contains `email`, secondary methods are visible and the email form shows the badge.
- [ ] Run the new tests and confirm they fail before production changes.
- [ ] Modify `components/nd/AuthModal.tsx`:
  - import `readRememberedAuthProvider`;
  - keep `rememberedProvider` state;
  - when `isOpen`, read storage and set `showOther(true)` for `google` or `email`;
  - render a small token badge using `var(--border)`, `var(--text-muted)`, `var(--nd-sans)`, uppercase micro-label rules, and no raw hex.
- [ ] Run the component tests and confirm they pass.

## Task 3: Persist Successful Provider

- [ ] Add a test around `BooksPage` if an existing practical test harness exists; otherwise keep this as a small effect verified by e2e in Task 4.
- [ ] Modify `components/nd/BooksPage.tsx` to import `writeRememberedAuthProvider` and persist `session.user.provider` when `isLoggedIn` and provider is valid.
- [ ] Do not write user id, email, name, or Telegram username to localStorage.
- [ ] Run `npm test -- components/nd/auth-provider-memory.test.ts` and the AuthModal test file.

## Task 4: E2E Layout Coverage

- [ ] Read `docs/features/testing.md`.
- [ ] Add a test to `e2e/ui-states.spec.ts` that seeds `localStorage.setItem('slowreading.lastAuthProvider', 'google')`, opens the auth modal, asserts the badge is visible, and uses `boundingBox()` to confirm the badge does not overlap the Google button text/container.
- [ ] Run `npm run test:e2e e2e/ui-states.spec.ts`.

## Task 5: Docs, Verification, Commit

- [ ] Update `docs/features/auth.md` with the local-storage hint behavior and privacy boundary.
- [ ] Update `docs/wiki/Auth-and-Users.md` and `docs/wiki/Privacy-and-User-Data.md`.
- [ ] Before commit, print:
  - `E2E: нужен — меняется conditional UI auth modal и layout-поведение бейджа`;
  - `Wiki: нужна — меняется пользовательское auth-поведение и privacy/data handling`.
- [ ] Run `npm run lint && npm run typecheck && npm test`.
- [ ] Run `npm run test:e2e e2e/ui-states.spec.ts`.
- [ ] Commit with `feat(auth): #366 — подсказка последнего способа входа`.

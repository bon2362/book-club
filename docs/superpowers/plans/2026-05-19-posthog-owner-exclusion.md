# PostHog Owner Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude the site owner and E2E test sessions from PostHog analytics to keep user behavior data clean.

**Architecture:** Three layered mechanisms — (1) permanent browser-level opt-out via `localStorage` when the owner's user ID is detected after login, (2) complete PostHog initialization skip in E2E test mode via an env var, and (3) Playwright network-level route blocking as defense-in-depth so even if the env var somehow fails, no PostHog requests escape the test runner.

**Tech Stack:** PostHog JS (`posthog-js`), Next.js 14, Playwright (E2E).

---

## Background and Problem Analysis

### Why data gets polluted

PostHog tracks two types of users:

- **Identified** — logged-in users whose `userId` is linked to a PostHog person profile
- **Anonymous** — unidentified visitors tracked by a persistent `distinct_id` cookie/localStorage key

The project already sets `person_profiles: 'identified_only'`, which means anonymous visitors don't get a PostHog *person profile*. However, **all events (pageviews, clicks) are still captured and counted** — they just aren't attributed to a named person. This still pollutes aggregate metrics: total session counts, pageview counts, time-on-page, bounce rate, etc.

### Pollution scenarios

| Scenario | Severity | Why |
|---|---|---|
| Owner logged in, regular browser | **High** — identified user in analytics, skews all user behaviour data |
| Owner not logged in, regular browser | **High** — same browser cookie = same distinct_id = same persistent anonymous user; behaviour tracked exactly like a real user |
| E2E test run (Playwright) | **High** — test actions (sign ups, book adds, navigations) appear as real user behaviour |
| Owner in incognito without login | **Medium** — fresh anonymous session each time, no persistent identity, still noise but not systematic |

### Why "filter in PostHog UI" is not the right fix

Filtering after the fact has two problems:
1. You must remember to apply the filter to every new insight/dashboard — easy to miss.
2. Raw event counts still include the owner's traffic; only views that have the filter applied are clean.

Sending zero events is strictly better for data quality.

---

## Solution Design

### Mechanism 1 — Permanent browser opt-out

PostHog's `posthog.opt_out_capturing()` writes a flag to `localStorage`. Once written:
- **No events are sent** from that browser, ever.
- The flag **survives logout** — PostHog checks it before queuing any event.
- The flag **survives switching accounts** — it is browser-scoped, not user-scoped.

**Flow:**
1. Owner opens the site in their regular browser for the first time.
2. They log in → `identifyUser(userId)` is called.
3. `identifyUser` calls `initPostHog()` eagerly (fixes race condition — see below).
4. Code checks if `userId` is in `NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS` (comma-separated env var).
5. Match → `posthog.opt_out_capturing()` is called → flag written to localStorage.
6. All subsequent visits in this browser (logged in or not, as any account) send zero data.

We do NOT call `posthog.opt_in_capturing()` in `resetIdentity()`. The browser stays opted out permanently.

**Race condition fix:** In `PostHogProvider`, `initPostHog()` lives in the parent's `useEffect`, while `identifyUser` is called from `IdentityTracker` (a child component). React runs child effects before parent effects on initial mount, so `identifyUser` could fire before `initPostHog()` — causing the `if (!initialized) return` guard to skip the opt-out. Fix: call `initPostHog()` at the top of `identifyUser()`. Since `initPostHog()` is idempotent, this is safe.

### Mechanism 2 — Complete PostHog skip in E2E test mode

Add `NEXT_PUBLIC_DISABLE_ANALYTICS: 'true'` to `playwright.config.ts` `webServer.env`. The `initPostHog()` function checks this var. If set, PostHog is never initialised — no events, not even anonymous ones.

### Mechanism 3 — Playwright route blocking (defense-in-depth)

A shared Playwright fixture (`e2e/fixtures.ts`) overrides the built-in `context` fixture to add `context.route()` blocking for all PostHog endpoints. This fires for every test regardless of env vars. All spec files import `test` and `expect` from `./fixtures` instead of `@playwright/test`.

---

## Files

| File | Action | Change |
|---|---|---|
| `lib/analytics.ts` | Modify | Race fix, `DISABLE_ANALYTICS` guard, excluded IDs opt-out, `currentIdentity` update, no opt-in on reset |
| `lib/analytics.test.ts` | Create | Unit tests including edge cases |
| `playwright.config.ts` | Modify | Add `NEXT_PUBLIC_DISABLE_ANALYTICS: 'true'` to `webServer.env` |
| `e2e/fixtures.ts` | Create | Custom `test` with auto route-blocking for PostHog |
| `e2e/*.spec.ts` (17 files) | Modify | Change import from `@playwright/test` to `./fixtures` |

---

## Tasks

### Task 1: Write failing unit tests (TDD)

**Files:**
- Create: `lib/analytics.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
// lib/analytics.test.ts
import posthog from 'posthog-js'

jest.mock('posthog-js', () => ({
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  opt_out_capturing: jest.fn(),
  opt_in_capturing: jest.fn(),
  has_opted_out_capturing: jest.fn(() => false),
}))

let analytics: typeof import('./analytics')

beforeEach(async () => {
  jest.resetModules()
  jest.clearAllMocks()
  analytics = await import('./analytics')
})

describe('initPostHog', () => {
  it('does not initialise when NEXT_PUBLIC_DISABLE_ANALYTICS is set', () => {
    process.env.NEXT_PUBLIC_DISABLE_ANALYTICS = 'true'
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    analytics.initPostHog()
    expect(posthog.init).not.toHaveBeenCalled()
    delete process.env.NEXT_PUBLIC_DISABLE_ANALYTICS
  })

  it('does not initialise when token is missing', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    analytics.initPostHog()
    expect(posthog.init).not.toHaveBeenCalled()
  })
})

describe('identifyUser — opt-out for excluded IDs', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = 'owner-uuid-1,owner-uuid-2'
    analytics.initPostHog()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
  })

  it('calls opt_out_capturing when userId is in excluded list', () => {
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('calls opt_out_capturing for the second excluded ID', () => {
    analytics.identifyUser('owner-uuid-2')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })

  it('does not call opt_out_capturing twice when identifyUser called twice with same excluded ID (idempotent)', () => {
    analytics.identifyUser('owner-uuid-1')
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })

  it('does NOT call opt_out_capturing for a regular user', () => {
    analytics.identifyUser('regular-user-uuid')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
    expect(posthog.identify).toHaveBeenCalledWith('regular-user-uuid')
  })

  it('does NOT call opt_out_capturing when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
  })

  it('handles empty EXCLUDED_USER_IDS env var without matching anything', () => {
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = ''
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
  })

  it('handles env var with spaces around commas', () => {
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = ' owner-uuid-1 , owner-uuid-2 '
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })
})

describe('identifyUser — lazy initPostHog (race condition fix)', () => {
  it('calls initPostHog internally so opt-out works even if initPostHog was not called before', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = 'owner-uuid-1'
    // Do NOT call initPostHog() — simulate the race where child effect fires first
    analytics.identifyUser('owner-uuid-1')
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
  })
})

describe('resetIdentity — never re-enables capturing', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    analytics.initPostHog()
    analytics.identifyUser('some-user')
  })

  it('does not call opt_in_capturing on reset', () => {
    analytics.resetIdentity()
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
  })

  it('calls posthog.reset on reset', () => {
    analytics.resetIdentity()
    expect(posthog.reset).toHaveBeenCalled()
  })
})
```

- [ ] **Step 1.2: Run tests — confirm they fail**

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && npm test -- lib/analytics.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL on opt-out tests and lazy init test.

---

### Task 2: Update `lib/analytics.ts`

**Files:**
- Modify: `lib/analytics.ts`

Changes vs original:
1. `identifyUser` now calls `initPostHog()` first (fixes race)
2. `initPostHog` checks `NEXT_PUBLIC_DISABLE_ANALYTICS`
3. `identifyUser` opts out and sets `currentIdentity` for excluded IDs (prevents double call)
4. `resetIdentity` never calls `opt_in_capturing`

- [ ] **Step 2.1: Replace file content**

```typescript
import posthog from 'posthog-js'

type EventProps = Record<string, string | number | boolean | undefined | null>

let initialized = false
let currentIdentity: string | null = null

function getExcludedIds(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS ?? ''
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
}

export function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
    respect_dnt: true,
  })
  initialized = true
}

export function isPostHogReady(): boolean {
  return initialized
}

export function track(event: string, properties?: EventProps): void {
  if (typeof window === 'undefined' || !initialized) return
  posthog.capture(event, properties)
}

export function capturePageview(url: string): void {
  if (typeof window === 'undefined' || !initialized) return
  posthog.capture('$pageview', { $current_url: url })
}

export function identifyUser(userId: string): void {
  if (typeof window === 'undefined') return
  initPostHog() // ensure init before identify, even if parent useEffect hasn't fired yet
  if (!initialized) return
  if (currentIdentity === userId) return
  if (getExcludedIds().has(userId)) {
    posthog.opt_out_capturing()
    currentIdentity = userId // prevent duplicate calls on re-render
    return
  }
  posthog.identify(userId)
  currentIdentity = userId
}

export function resetIdentity(): void {
  if (typeof window === 'undefined' || !initialized) return
  if (currentIdentity === null) return
  posthog.reset()
  currentIdentity = null
  // Intentionally NOT calling opt_in_capturing() here.
  // Once a browser is opted out (owner's browser), it stays opted out
  // permanently regardless of which account is used next.
}
```

- [ ] **Step 2.2: Run unit tests — expect all to pass**

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && npm test -- lib/analytics.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 2.3: Run lint and typecheck**

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add lib/analytics.ts lib/analytics.test.ts
git commit -m "feat: exclude owner browser from PostHog analytics (opt-out on identify)"
```

---

### Task 3: Disable analytics in E2E via env var

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 3.1: Add env var to webServer**

Edit `playwright.config.ts`, `webServer.env` block:

```typescript
    env: {
      NEXTAUTH_TEST_MODE: 'true',
      NEXT_PUBLIC_DISABLE_ANALYTICS: 'true',
    },
```

- [ ] **Step 3.2: Lint and typecheck**

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && npm run lint && npm run typecheck
```

---

### Task 4: Create E2E fixture with PostHog route blocking

**Files:**
- Create: `e2e/fixtures.ts`

This file exports a custom `test` that overrides the built-in `context` fixture to block all network requests to PostHog endpoints. All spec files import from here instead of `@playwright/test`.

- [ ] **Step 4.1: Create the fixture file**

```typescript
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const POSTHOG_PATTERNS = ['**/eu.i.posthog.com/**', '**/eu.posthog.com/**', '**/app.posthog.com/**']

export const test = base.extend({
  context: async ({ context }, use) => {
    for (const pattern of POSTHOG_PATTERNS) {
      await context.route(pattern, (route) => route.abort())
    }
    await use(context)
  },
})

export { expect }
export type { Page }
```

- [ ] **Step 4.2: Update imports in all spec files**

Run this sed command to replace `@playwright/test` with `./fixtures` in all spec files:

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && \
  sed -i '' "s|from '@playwright/test'|from './fixtures'|g" e2e/*.spec.ts
```

- [ ] **Step 4.3: Verify imports were updated**

```bash
grep -n "from '@playwright/test'" /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2/e2e/*.spec.ts
```

Expected: no output (all replaced).

```bash
grep -n "from './fixtures'" /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2/e2e/*.spec.ts | head -20
```

Expected: all spec files show the fixture import.

- [ ] **Step 4.4: Lint and typecheck**

```bash
cd /Users/ekoshkin/book-club/.claude/worktrees/hopeful-sinoussi-3f84b2 && npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4.5: Commit**

```bash
git add playwright.config.ts e2e/fixtures.ts e2e/*.spec.ts
git commit -m "feat: block PostHog in E2E tests (env var + network-level route abort)"
```

---

### Task 5 (manual, post-deploy): Activate opt-out in owner's browser

This cannot be automated — it requires knowing the owner's UUID and a browser action.

- [ ] **Step 5.1: Find your user ID**

```sql
SELECT id, email FROM users WHERE email = 'bon2362@gmail.com';
```

- [ ] **Step 5.2: Add env var to Vercel**

Settings → Environment Variables:
```
NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = <your-uuid>
```
Set for Production and Preview. Add to `.env.local` for Development.

- [ ] **Step 5.3: Redeploy and verify**

After deploying: open site → log in → DevTools → Application → Local Storage → confirm `ph_*_opt_out = 1` appears.

---

## What Is Not Covered

| Scenario | Status | Reason |
|---|---|---|
| Owner in incognito without login | Not covered | `localStorage` cleared per incognito session. Accepted as medium severity. |
| Owner's first visit before ever logging in | Partially — events until first login | After first login, browser is permanently opted out. |
| Safari ITP localStorage eviction | Risk (low) | Safari deletes localStorage after 7 days of inactivity. Opt-out could silently reset. Re-login restores it. |
| E2E against a production build (`next start`) | Not covered by env var | `NEXT_PUBLIC_*` are baked at build time. Route blocking (Mechanism 3) still catches this case. |

# Google One Tap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google One Tap to the homepage so unauthenticated users with a Google account in their browser can sign in with one click.

**Architecture:** A new `Credentials` provider (`google-one-tap`) is added to NextAuth. The JWT verification + DB upsert logic lives in a separate file `lib/auth.google-one-tap.ts` so it can be unit-tested cleanly. A client component `components/nd/GoogleOneTap.tsx` loads the GSI script and calls `signIn('google-one-tap', { credential })` on success. The component is mounted on the homepage only for unauthenticated users.

**Tech Stack:** NextAuth v5 Credentials provider, `google-auth-library` (already installed), `@types/google-one-tap` (new dev dep), Drizzle ORM, Next.js 14 server component

---

## Chunk 1: Env var + types + authorize logic

### Task 1: Add env var and install types

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (manually, not committed)

- [ ] **Step 1: Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `.env.example`**

In `.env.example`, after the `GOOGLE_CLIENT_SECRET` line, add:
```
# Google One Tap (same value as GOOGLE_CLIENT_ID, must be NEXT_PUBLIC_ for client components)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
```

- [ ] **Step 2: Add the value to your local `.env.local`**

Copy the existing value of `GOOGLE_CLIENT_ID` from `.env.local` and add:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same value as GOOGLE_CLIENT_ID>
```

> Note: `.env.local` is gitignored and blocked by the `block-env-local` hook — edit it manually in the terminal: `nano /workspace/.env.local`

- [ ] **Step 3: Install `@types/google-one-tap` as dev dependency**

```bash
npm install --save-dev @types/google-one-tap
```

Expected: package added to `devDependencies` in `package.json`.

- [ ] **Step 4: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json package-lock.json
git commit -m "chore: add NEXT_PUBLIC_GOOGLE_CLIENT_ID env var and @types/google-one-tap"
```

---

### Task 2: Write failing tests for authorize logic

**Files:**
- Create: `lib/auth.google-one-tap.test.ts`

The `authorizeGoogleOneTap(credential)` function will:
1. Verify the credential JWT using `google-auth-library`
2. Look up user in DB by email
3. If found: return `{ id, email, name }`
4. If not found: insert `users` + `accounts` rows, return `{ id, email, name }`
5. On any error: return `null`

- [ ] **Step 1: Create the test file**

```typescript
// lib/auth.google-one-tap.test.ts
/**
 * @jest-environment node
 *
 * Unit tests for Google One Tap JWT verification and user upsert logic.
 */

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))

// Mock the DB
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))

import { OAuth2Client } from 'google-auth-library'
import { authorizeGoogleOneTap } from './auth.google-one-tap'
import { db } from '@/lib/db'

const mockVerifyIdToken = jest.fn()
const mockGetPayload = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(OAuth2Client as jest.Mock).mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  }))
  mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
})

const VALID_PAYLOAD = {
  sub: 'google-sub-123',
  email: 'user@example.com',
  name: 'Ivan Petrov',
}

function mockDbSelect(rows: { id: string }[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
  ;(db.select as jest.Mock).mockReturnValue(chain)
  return chain
}

function mockDbInsert() {
  const chain = { values: jest.fn().mockResolvedValue(undefined) }
  ;(db.insert as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('authorizeGoogleOneTap', () => {
  it('returns null when credential is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'))
    const result = await authorizeGoogleOneTap('bad-credential')
    expect(result).toBeNull()
  })

  it('returns null when payload is null', async () => {
    mockGetPayload.mockReturnValue(null)
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns null when payload has no email', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', name: 'No Email' })
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns existing user when found in DB by email', async () => {
    mockGetPayload.mockReturnValue(VALID_PAYLOAD)
    mockDbSelect([{ id: 'existing-uuid' }])

    const result = await authorizeGoogleOneTap('credential')

    expect(result).toEqual({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'Ivan Petrov',
    })
    // Should NOT insert anything for existing users
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('creates new user + accounts entry when user not found in DB', async () => {
    mockGetPayload.mockReturnValue(VALID_PAYLOAD)
    mockDbSelect([])
    // Two inserts: users then accounts — use mockReturnValueOnce for correctness
    const chain1 = { values: jest.fn().mockResolvedValue(undefined) }
    const chain2 = { values: jest.fn().mockResolvedValue(undefined) }
    ;(db.insert as jest.Mock).mockReturnValueOnce(chain1).mockReturnValueOnce(chain2)

    const result = await authorizeGoogleOneTap('credential')

    expect(result).not.toBeNull()
    expect(result!.email).toBe('user@example.com')
    expect(result!.name).toBe('Ivan Petrov')
    expect(typeof result!.id).toBe('string')
    // Should insert into both users and accounts
    expect(db.insert).toHaveBeenCalledTimes(2)
    expect(chain1.values).toHaveBeenCalledTimes(1)
    expect(chain2.values).toHaveBeenCalledTimes(1)
  })

  it('falls back to email as name when payload has no name', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', email: 'user@example.com' })
    mockDbSelect([{ id: 'existing-uuid' }])

    const result = await authorizeGoogleOneTap('credential')

    expect(result!.name).toBe('user@example.com')
  })
})
```

- [ ] **Step 2: Run tests — expect them to FAIL (module not found)**

```bash
npx jest lib/auth.google-one-tap.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './auth.google-one-tap'`

- [ ] **Step 3: Commit the failing test (red state)**

```bash
git add lib/auth.google-one-tap.test.ts
git commit -m "test(auth): добавить тесты для authorizeGoogleOneTap (red)"
```

---

### Task 3: Implement authorizeGoogleOneTap

**Files:**
- Create: `lib/auth.google-one-tap.ts`

- [ ] **Step 1: Create the implementation file**

```typescript
// lib/auth.google-one-tap.ts
import { OAuth2Client } from 'google-auth-library'
import { db } from '@/lib/db'
import { users, accounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function authorizeGoogleOneTap(
  credential: string
): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) return null

    const { sub, email, name } = payload

    // Find existing user by email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      return { id: existing[0].id, email, name: name ?? email }
    }

    // New user: insert into users + accounts
    // accounts entry prevents OAuthAccountNotLinked if user later signs in via Google OAuth button
    const newId = crypto.randomUUID()
    await db.insert(users).values({
      id: newId,
      email,
      name: name ?? email,
      emailVerified: new Date(),
    })
    await db.insert(accounts).values({
      userId: newId,
      type: 'oidc',
      provider: 'google',
      providerAccountId: sub,
    })
    return { id: newId, email, name: name ?? email }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Run tests — expect them to PASS**

```bash
npx jest lib/auth.google-one-tap.test.ts --no-coverage
```

Expected: PASS — 6 tests pass.

- [ ] **Step 3: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit the implementation (green state)**

```bash
git add lib/auth.google-one-tap.ts
git commit -m "feat(auth): реализовать authorizeGoogleOneTap (green)"
```

---

## Chunk 2: NextAuth provider + client component + homepage

### Task 4: Wire authorize into NextAuth Credentials provider

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Add the `google-one-tap` Credentials provider to `lib/auth.ts`**

At the top of `lib/auth.ts`, add the import:
```typescript
import { authorizeGoogleOneTap } from '@/lib/auth.google-one-tap'
```

Inside the `providers: [...]` array in `NextAuth({...})`, add after the existing `Credentials({ id: 'telegram', ... })` block:

```typescript
Credentials({
  id: 'google-one-tap',
  credentials: {},
  async authorize(credentials) {
    const { credential } = credentials as { credential: string }
    return authorizeGoogleOneTap(credential)
  },
}),
```

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test --no-coverage
```

Expected: all tests pass (including existing auth tests).

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): подключить google-one-tap Credentials provider"
```

---

### Task 5: Create GoogleOneTap client component

**Files:**
- Create: `components/nd/GoogleOneTap.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/nd/GoogleOneTap.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function GoogleOneTap() {
  const router = useRouter()

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: async ({ credential }: { credential: string }) => {
          await signIn('google-one-tap', { credential, redirect: false })
          router.refresh()
        },
      })
      window.google?.accounts.id.prompt()
    }
    document.body.appendChild(script)
    return () => {
      // Cancel the prompt if still visible, then remove script
      window.google?.accounts.id.cancel()
      document.body.removeChild(script)
    }
  }, [router])

  return null
}
```

> Note: `@types/google-one-tap` installed in Task 1 provides the `window.google` types automatically — no manual `declare global` needed.

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors. If `window.google` is not typed, verify `@types/google-one-tap` is installed and `tsconfig.json` includes it (should be automatic for `@types/*` packages).

- [ ] **Step 3: Commit**

```bash
git add components/nd/GoogleOneTap.tsx
git commit -m "feat(ui): добавить GoogleOneTap client component"
```

---

### Task 6: Mount GoogleOneTap on homepage

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Import and mount the component**

In `app/page.tsx`, add the import at the top:
```typescript
import GoogleOneTap from '@/components/nd/GoogleOneTap'
```

In the `return (...)` block, add `<GoogleOneTap />` inside `<SessionProvider>` but only when there is no session. The current return is:

```tsx
return (
  <SessionProvider>
    <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} />
  </SessionProvider>
)
```

Change to:

```tsx
return (
  <SessionProvider>
    {!session && <GoogleOneTap />}
    <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} />
  </SessionProvider>
)
```

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): показывать Google One Tap на главной для незалогиненных"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the homepage in an incognito window**

Navigate to `http://localhost:3000`. If you have a Google account logged in the browser, you should see the Google One Tap floating prompt appear in the bottom-right corner within a few seconds.

- [ ] **Step 3: Sign in via One Tap**

Click your account in the One Tap prompt. The page should refresh and you should be logged in (navbar should reflect logged-in state).

- [ ] **Step 4: Verify DB entries**

Check that `users` and `accounts` tables have the new entries (if it was a new user):
```bash
# Using psql or your DB client:
SELECT * FROM "user" WHERE email = 'your@email.com';
SELECT * FROM account WHERE "userId" = '<the id from above>';
```

Expected: `users` row with `emailVerified` set, `accounts` row with `provider = 'google'`.

- [ ] **Step 5: Sign out and verify One Tap shows again**

Sign out, return to homepage — One Tap prompt should appear again (Google may apply a cooldown after recent use; try a different browser if it doesn't appear immediately).

- [ ] **Step 5b: Verify session.user.id matches DB UUID (not Google sub)**

Open browser devtools → Application → Cookies, find the `next-auth.session-token` cookie, decode it (it's a JWT — paste at jwt.io). Confirm that the `sub` field in the payload is a UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`), NOT a Google numeric sub (e.g., `102938475610293847561`).

Alternatively, call the session endpoint:
```bash
curl http://localhost:3000/api/auth/session
```
Expected: `"id"` in `user` object matches the UUID from the `users` table, not the Google `sub`.

- [ ] **Step 6: Push and verify CI**

```bash
git push
```

Expected: GitHub Actions CI passes. Monitor with:
```bash
gh run list --limit 3
```

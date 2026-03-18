# Google One Tap — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Overview

Add Google One Tap authentication to the homepage. When an unauthenticated user visits the main page and has an active Google account in their browser, Google automatically shows a floating prompt allowing one-click sign-in without opening the AuthModal.

## Scope

- Appears **only on the homepage** (`app/page.tsx`), only for **unauthenticated users**
- Triggers **automatically on page load** — no user action required
- After successful sign-in: **page refreshes** (`router.refresh()`)
- Complements existing AuthModal (Google button, magic link, Telegram) — does not replace it

## Architecture

### New files

**`components/nd/GoogleOneTap.tsx`** — client component
- Loads `https://accounts.google.com/gsi/client` script dynamically on mount
- Declares `window.google` type via `declare global { interface Window { google: ... } }` (see TypeScript section)
- Calls `google.accounts.id.initialize({ client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, callback })`
- Calls `google.accounts.id.prompt()` once on mount
- On credential callback: calls `signIn('google-one-tap', { credential, redirect: false })` then `router.refresh()`
- Renders nothing visible — GSI renders the floating prompt itself
- Does not need to be inside `<SessionProvider>` — `signIn` from `next-auth/react` does not require it as an ancestor

### Modified files

**`lib/auth.ts`** — add new Credentials provider:

```ts
Credentials({
  id: 'google-one-tap',
  credentials: {},
  // Note: even with `credentials: {}` (empty descriptor), NextAuth v5 passes through
  // all fields from signIn()'s second argument into authorize(). This is confirmed behavior.
  async authorize(credentials) {
    const { credential } = credentials as { credential: string }

    // 1. Verify JWT via OAuth2Client from google-auth-library (already installed)
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) return null

    const { sub, email, name } = payload

    // 2. Find existing user by email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      // Return existing user's DB id (stable across auth methods)
      return { id: existing[0].id, email, name: name ?? email }
    }

    // 3. Create new user — use Google sub as a seed for a deterministic id,
    //    or generate a UUID. Insert with emailVerified = now (Google has verified it).
    const newId = crypto.randomUUID()
    await db.insert(users).values({
      id: newId,
      email,
      name: name ?? email,
      emailVerified: new Date(),
    })
    return { id: newId, email, name: name ?? email }
  }
})
```

Key points:
- `id` in the return value is always the **DB row id** (UUID), not `sub`. This ensures `token.sub` in the JWT callback matches the real user id, keeping sessions consistent with users created via standard Google OAuth.
- New users are inserted into the `users` table, so the existing JWT guard (`db.select by email → if empty return null`) will not invalidate the session on subsequent requests.
- `emailVerified` is set to `new Date()` since Google has already verified the email.

**`app/page.tsx`** — mount component for unauthenticated users:
```tsx
{!session && <GoogleOneTap />}
```
- `session` is already fetched server-side via `auth()` — no extra requests
- Placement: inside the JSX returned by the server component, outside or inside `<SessionProvider>` — both work since `signIn()` from `next-auth/react` doesn't require `SessionProvider` as an ancestor

## Data Flow

1. Homepage renders → `<GoogleOneTap />` loads GSI script
2. GSI checks browser for active Google accounts
3. If found → shows floating One Tap prompt (Google-rendered UI)
4. User clicks account → GSI calls component callback with `credential` (signed JWT)
5. Component calls `signIn('google-one-tap', { credential, redirect: false })`
6. NextAuth routes to the new Credentials provider's `authorize()`
7. `google-auth-library` verifies the JWT, extracts `sub`, `email`, `name`
8. DB lookup by email:
   - Found → return `{ id: existingUser.id, email, name }`
   - Not found → insert new user with UUID, return `{ id: newId, email, name }`
9. NextAuth creates JWT session with `token.sub = returned id`
10. Component calls `router.refresh()` → page reloads with active session

## TypeScript

The GSI client script exposes `window.google.accounts.id` — this is not covered by `google-auth-library` types. Two options:
1. **Install `@types/google-one-tap`** (preferred, zero maintenance)
2. **Inline type declaration** in `GoogleOneTap.tsx`:
   ```ts
   declare global {
     interface Window {
       google: {
         accounts: {
           id: {
             initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
             prompt: () => void
           }
         }
       }
     }
   }
   ```

Prefer option 1 if `@types/google-one-tap` is available on npm (check before implementing).

## Environment Variables

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — add to `.env.local` (same value as existing `GOOGLE_CLIENT_ID`)
- Also add to `.env.example` for documentation
- Also add to GitHub Actions secrets if CI exercises the One Tap component (currently unlikely — GSI loads from external URL so unit/e2e tests would mock it)

## Constraints & Notes

- **No new runtime dependencies** — `google-auth-library` is already installed. Possibly add `@types/google-one-tap` as a dev dependency.
- Credentials provider does not create `accounts` table entries via Drizzle adapter — consistent with existing Telegram provider behavior
- If user dismisses One Tap, Google applies a cooldown automatically (browser-managed)
- One Tap does not show if: user is already signed in, or no Google accounts found in browser
- GSI prompt is rendered by Google — no custom styling needed or possible

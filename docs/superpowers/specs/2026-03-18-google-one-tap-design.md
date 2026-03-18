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
- Loads `https://accounts.google.com/gsi/client` script dynamically
- Calls `google.accounts.id.initialize({ client_id, callback })`
- Calls `google.accounts.id.prompt()` once on mount
- On credential callback: calls `signIn('google-one-tap', { credential, redirect: false })` then `router.refresh()`
- Renders nothing visible — GSI renders the floating prompt itself

### Modified files

**`lib/auth.ts`** — add new Credentials provider:
```ts
Credentials({
  id: 'google-one-tap',
  credentials: {},
  async authorize(credentials) {
    const { credential } = credentials as { credential: string }
    // Verify JWT via OAuth2Client from google-auth-library (already installed)
    // Extract payload: sub, email, name
    // db.select user by email → if not found, db.insert
    // Return { id, email, name }
  }
})
```

**`app/page.tsx`** — mount component for unauthenticated users:
```tsx
{!session && <GoogleOneTap />}
```
`session` is already fetched server-side via `auth()` — no extra requests.

## Data Flow

1. Homepage renders → `<GoogleOneTap />` loads GSI script
2. GSI checks browser for active Google accounts
3. If found → shows floating One Tap prompt (Google-rendered UI)
4. User clicks account → GSI calls component callback with `credential` (signed JWT)
5. Component calls `signIn('google-one-tap', { credential, redirect: false })`
6. NextAuth routes to the new Credentials provider's `authorize()`
7. `google-auth-library` verifies the JWT, extracts `sub`, `email`, `name`
8. DB lookup by email → create user if not found
9. NextAuth creates JWT session → component calls `router.refresh()`
10. Page reloads with active session

## Environment Variables

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — add to `.env.local` (same value as existing `GOOGLE_CLIENT_ID`)

## Constraints & Notes

- **No new dependencies** — `google-auth-library` is already installed
- Credentials provider does not create `accounts` table entries via Drizzle adapter — consistent with existing Telegram provider behavior
- If user dismisses One Tap, Google applies a cooldown automatically (browser-managed)
- One Tap does not show if: user is already signed in, or no Google accounts found in browser
- GSI prompt is rendered by Google — no custom styling needed or possible

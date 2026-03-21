# Authentication

## What it does
Users can sign in via Google One Tap, Google OAuth, magic link (email), or Telegram. After sign-in, session data is stored as JWT. Admin users get an `isAdmin` flag that unlocks the admin panel.

## How it works
- **NextAuth v5** (`lib/auth.ts`) — `auth()` server function used in Server Components and API routes
- **Google One Tap** — Credentials provider (`google-one-tap`); `lib/auth.google-one-tap.ts` verifies the JWT credential via `google-auth-library`, finds or creates user in `users` + `accounts` tables. Rendered as `<GoogleOneTap />` on the home page for unauthenticated users. After sign-in uses `window.location.reload()` (not `router.refresh()`) to avoid race condition where `useSession()` updates before server props re-render.
- **Google OAuth** — standard provider, user profile stored in `users` + `accounts` tables on first sign-in
- **Magic link (Resend provider)** — sends a 24-hour login link via `noreply@slowreading.club`; custom HTML email in `sendMagicLinkEmail()`
- **Telegram Login** — uses `data-auth-url` redirect flow (NOT `data-onauth` callback — Telegram uses `eval` internally which browsers block). Flow: widget → `/api/auth/telegram/callback` (verifies HMAC, upserts user, generates signed pre-auth token) → `/auth/telegram` (client page calls `signIn('telegram-preauth', ...)`) → home. Two Credentials providers: `telegram` (direct HMAC verify, legacy) and `telegram-preauth` (validates short-lived HMAC token from callback route). Credentials providers do NOT use DrizzleAdapter — user must be manually upserted in `authorize` via `db.insert(users).onConflictDoUpdate(...)`. BotFather requirements: exact domain match (with/without www matters) + bot must have a profile photo.
- **isAdmin flag** — set in `jwt` callback by checking `ADMIN_EMAIL` env var; stored in JWT token, available as `session.user.isAdmin`
- **Session strategy** — JWT (`strategy: 'jwt'`); `session.user.id = token.sub` set in `session` callback

## Race condition: ContactsForm after One Tap login
After One Tap login, `useSession()` (client) updates before server props (`currentUser`) arrive from `router.refresh()`. This causes ContactsForm to briefly open with empty fields. Fix: `GoogleOneTap` sets `sessionStorage.setItem('reloading_after_onetap', '1')` before `window.location.reload()`, and `BooksPage` checks + clears this flag before showing the form.

## Env vars
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — required for One Tap (embedded in client bundle at build time)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for standard Google OAuth and One Tap server-side verification
- `TELEGRAM_BOT_TOKEN` — for HMAC-SHA256 verification of Telegram widget data
- `NEXT_PUBLIC_TELEGRAM_BOT_NAME` — bot username (without @), rendered in widget's `data-telegram-login`
- `NEXTAUTH_SECRET` — used as `AUTH_SECRET` fallback; when writing manual HMAC outside NextAuth, use `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`

## Key files
- `lib/auth.ts` — NextAuth config, providers, JWT/session callbacks, magic link email
- `lib/auth.google-one-tap.ts` — Google One Tap credential verification and user upsert
- `components/nd/GoogleOneTap.tsx` — client component, renders on home page for unauthenticated users
- `lib/db/schema.ts` — `users`, `accounts`, `sessions`, `verificationTokens` tables
- `app/api/auth/[...nextauth]/route.ts` — NextAuth handler
- `app/api/auth/telegram/callback/route.ts` — Telegram redirect handler: verifies hash, upserts user, creates HMAC pre-auth token
- `app/auth/telegram/page.tsx` — client page that calls `signIn('telegram-preauth', ...)` and redirects home
- `components/nd/AuthModal.tsx` — login modal with Google, magic link, and Telegram widget
- `middleware.ts` / `proxy.ts` — route protection (redirect unauthenticated users)

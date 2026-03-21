# Authentication

## What it does
Users can sign in via Google OAuth or magic link (email). After sign-in, session data is stored in Neon Postgres via the Drizzle adapter. Admin users get an `isAdmin` flag that unlocks the admin panel.

## How it works
- **NextAuth v5** (`lib/auth.ts`) — `auth()` server function used in Server Components and API routes
- **Google OAuth** — standard provider, user profile stored in `users` + `accounts` tables on first sign-in
- **Magic link (Resend provider)** — sends a 24-hour login link via `noreply@slowreading.club`; custom HTML email in `sendMagicLinkEmail()`
- **Telegram OAuth** — `verifyTelegramHash()` validates widget data via HMAC-SHA256 using `TELEGRAM_BOT_TOKEN`
- **isAdmin flag** — set in `jwt` callback by checking `ADMIN_EMAILS` env var; stored in JWT token, available as `session.user.isAdmin`
- **Session strategy** — database sessions via `DrizzleAdapter`; `session.user.id = token.sub` set in `session` callback

## Key files
- `lib/auth.ts` — NextAuth config, providers, JWT/session callbacks, magic link email
- `lib/db/schema.ts` — `users`, `accounts`, `sessions`, `verificationTokens` tables
- `app/api/auth/[...nextauth]/route.ts` — NextAuth handler
- `middleware.ts` / `proxy.ts` — route protection (redirect unauthenticated users)

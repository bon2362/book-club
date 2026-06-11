# Duplicate Auth Users Design

## Goal

Issue #366 fixes the duplicate-user loop where a person first signs up with one provider and later returns with another provider, for example Google first and Telegram later. The solution is intentionally split into three PRs:

1. login hint: reduce accidental duplicate creation;
2. account linking: let a signed-in user attach more providers to the same account;
3. admin merge: repair duplicates that already exist.

## Current State

`user_identities` is the canonical auth-identity table. It stores `provider`, `provider_account_id`, optional provider-specific email/Telegram username, and `last_seen_at`. `users.contact_email` is profile/contact data, not a full identity model. `app/api/me` and admin user summaries already derive the latest provider from `user_identities`.

Telegram Login does not provide email. Therefore Google/email and Telegram users cannot be safely auto-merged during anonymous sign-in without explicit proof that the current human owns both identities.

## PR1: Login Hint

The login modal should remember the last successful provider in browser-local storage and mark that provider on the next sign-in attempt. This is a client-side usability hint, not an auth source of truth.

Behavior:

- After a signed-in session is observed, store `slowreading.lastAuthProvider = google | telegram | email`.
- On `AuthModal` open, read that value.
- Show a small token-styled badge: `последний способ входа`.
- If the remembered provider is Google or email, automatically reveal the secondary methods block because Telegram is currently primary and Google/email are hidden behind "Войти другим способом".
- Do not store email, Telegram username, user id, or any other PII.

## PR2: Account Linking

The profile drawer should show all linked providers and allow linking another provider to the current user.

Data/API:

- Extend `GET /api/me` to return `identities: { provider, email, telegramUsername, lastSeenAt }[]`.
- Add `POST /api/account/identities/google` for Google One Tap ID-token linking. The route must require a current session, verify the credential server-side, and call an audit-aware identity-link helper for the current `session.user.id`.
- Add `POST /api/account/identities/email/request` and `POST /api/account/identities/email/confirm` using signed short-lived tokens. The confirm route must require the same current session and link `provider=email`.
- Add a Telegram linking callback in a separate route from normal sign-in, guarded by a signed state token created for the current user.

Security:

- Never link a provider identity already attached to a different user; return `409`.
- Do not use anonymous sign-in callbacks as proof of ownership for the currently signed-in account.
- Linking mutates `user_identities` and sometimes `users`, so it must run through `withAuditContext` with `source: 'profile'`.

UI:

- Replace the single provider row in `ProfileDrawer` with `Способы входа`.
- Show provider labels and last-used timestamps.
- Show actions only for missing providers.
- If linking conflicts, explain that the method already belongs to another account and suggest contacting the admin.

## PR3: Admin Merge

Admins need a repair workflow for duplicates.

API:

- Add `POST /api/admin/users/merge`.
- Body: `{ sourceUserId, targetUserId, reason }`.
- Require admin session.
- Validate: non-empty ids, different ids, both users exist, `reason` has text, and the source user is not the current admin.
- Run the whole operation in one `withAuditContext({ source: 'admin', reason })` transaction.

Merge rules:

- `user_identities`: move all source identities to target; provider/account unique conflicts abort with `409`.
- `signup_books`: merge by `(user_id, book_id)`. Keep the earliest `signed_at`. Keep the strongest personal status by order `read > reading > null`; keep the newest `personal_status_updated_at` when statuses match.
- `book_priorities`: keep target order first, append source-only books by source rank, then renumber ranks from 1.
- `book_submissions`, `feedback`, `user_activity_events`, `telegram_preauth_tokens`, `matching_session_participants`, `matching_pseudonym_reservations`, `matching_preference_events`: reassign source references to target where possible.
- `matching_preference_events.actor_user_id`: reassign when the source acted.
- `matching_sessions.created_by`: set to target when source created the session.
- `notification_queue`: if the source has a contact email, rewrite pending source rows to the target profile contact details when possible.
- Finally delete the source `users` row.

Audit:

- Low-level changes are already covered by audit triggers for audited tables.
- Add `user_merge_events` as an append-only summary table with source/target snapshots and counts. Add it to `AUDITED_TABLES` and create an audit trigger migration. This gives admins one readable event in addition to row-level diffs.

UI:

- In admin user drawer, add "Слить дубль" action.
- The flow asks for a target user and a reason, shows a preview, and requires explicit confirmation.
- After merge, refresh user list and close the source drawer if it was merged away.

## Testing

PR1:

- Unit/component tests for local-storage hint helpers and modal rendering.
- E2E layout test in `e2e/ui-states.spec.ts` because login UI conditional rendering changes.

PR2:

- Unit tests for identity linking helpers and conflict cases.
- Route tests for auth, success, conflict, invalid token.
- E2E for visible "Способы входа" and successful link persistence where existing fixtures allow it.
- Telegram auth/linking changes require `e2e/telegram-auth.spec.ts` or equivalent route-level coverage if widget automation is not reliable.

PR3:

- Unit tests for pure merge planner/resolution rules.
- Route tests for validation, conflict, success, and audit context.
- E2E admin merge flow with page reload after merge to verify persistence.

## Documentation

Each PR updates the appropriate technical docs in `docs/features/auth.md`, `docs/features/admin-panel.md`, and the owner-facing wiki pages in `docs/wiki/Auth-and-Users.md`, `docs/wiki/Admin-Panel.md`, `docs/wiki/Data-and-Database.md`, and `docs/wiki/Privacy-and-User-Data.md` as applicable.

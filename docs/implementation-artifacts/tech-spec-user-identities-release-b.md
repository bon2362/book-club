---
status: ready-for-dev
source_plan: docs/planning-artifacts/user-identity-activity-refactor-plan.md
issue: 122
date: 2026-05-19
---

# User Identities Release B

## Goal

Ship identity-based auth for new users without physically migrating legacy primary keys.

## Scope

- Add `user_identities` as the domain source of truth for external provider ids.
- Keep Auth.js `account` as the technical adapter table for Google OAuth compatibility.
- Add a transaction-based helper for resolving or creating users from provider identities.
- Switch Telegram callback/preauth to canonical user ids for newly-created Telegram users.
- Switch Google One Tap to the same helper and sync both `account` and `user_identities`.
- Update test-mode session creation so E2E exercises the same identity model.

## Explicit Non-Goals

- Do not migrate existing `telegram:*` primary keys to UUID.
- Do not make `users.email` nullable in this release.
- Do not remove or bypass Auth.js `account`.
- Do not change unrelated user-facing UI.

## Acceptance Criteria

Given a new Telegram login, when `/api/auth/telegram/callback` receives a valid Telegram payload, then it creates a UUID `users.id`, stores Telegram numeric id in `user_identities`, creates a preauth token for the UUID, and redirects with `uid=<uuid>`.

Given an existing legacy `telegram:*` user, when the Telegram identity is resolved, then login remains compatible and no physical primary-key migration is attempted.

Given Google One Tap login, when a new Google user is created, then `users`, `account`, and `user_identities` are created consistently for the same canonical UUID.

Given email/test-mode session creation, when the endpoint creates a user, then an `email` identity is present and `session.user.id` is the canonical `users.id`.

Given duplicate provider identity requests, when the helper runs twice, then `(provider, provider_account_id)` remains unique and the existing user is returned.

## Verification

- Unit tests for identity helper idempotency, provider normalization, Telegram canonical id creation, legacy compatibility, Google One Tap sync, and test session identity creation.
- Auth chain E2E is required because provider/session behavior changes.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and relevant Playwright auth/profile/admin flows before commit.

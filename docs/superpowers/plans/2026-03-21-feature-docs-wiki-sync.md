# Feature Docs + GitHub Wiki Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `docs/features/` with concise feature documentation and a GitHub Actions workflow that syncs it to the public GitHub Wiki on every push to `main`.

**Architecture:** Five markdown files (one per feature area) live in `docs/features/`. A GitHub Actions workflow triggers on changes to that folder, clones the wiki repo, overwrites it with the feature docs, auto-generates `Home.md`, and pushes. Wiki is always a read-only mirror of `docs/features/`.

**Tech Stack:** Markdown, GitHub Actions (ubuntu-latest, bash), `secrets.GITHUB_TOKEN`

---

## Prerequisites

- [ ] Enable GitHub Wiki manually once: go to https://github.com/bon2362/book-club/settings → General → Features → check "Wikis". The workflow needs the wiki repo to exist before it can push to it.

---

## File Map

| Action | Path |
|--------|------|
| Create | `docs/features/auth.md` |
| Create | `docs/features/books-catalog.md` |
| Create | `docs/features/admin-panel.md` |
| Create | `docs/features/notifications.md` |
| Create | `docs/features/user-profile.md` |
| Create | `.github/workflows/wiki-sync.yml` |

---

## Task 1: docs/features/auth.md

**Files:**
- Create: `docs/features/auth.md`

- [ ] **Step 1: Create the file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/auth.md
git commit -m "docs: add auth feature documentation"
```

---

## Task 2: docs/features/books-catalog.md

**Files:**
- Create: `docs/features/books-catalog.md`

- [ ] **Step 1: Create the file**

```markdown
# Books Catalog

## What it does
Displays the club's reading list. Each book shows title, author, tags, description (expandable), cover image, and read status. Books are fetched from Google Sheets on the server.

## How it works
- **Data source** — Google Sheets via `lib/sheets.ts`; `fetchBooks()` reads all rows, caches in-memory for 10 minutes. `coverUrl` comes from column L (row[11])
- **No external cover API** — Google Books API was removed (429 rate limits). Covers must be added manually to column L in the spreadsheet
- **Pass-through** — `lib/books-with-covers.ts` maps sheet rows to `BookWithCover` objects; no DB queries involved
- **CoverImage** — client component (`components/nd/CoverImage.tsx`); shows cover if `coverUrl` is set, falls back to author initials on `onError`
- **BookCard** — shows book info with expand/collapse for descriptions > 120 characters; "Читать далее" / "Свернуть" buttons
- **Priority numbers** — books show rank from `book_priorities` table; shown as `—` until user sets priorities

## Key files
- `lib/sheets.ts` — Google Sheets client, `fetchBooks()`, `Book` type, coverUrl from column L
- `lib/books-with-covers.ts` — maps `Book[]` → `BookWithCover[]`
- `components/nd/CoverImage.tsx` — cover display with initials fallback
- `components/nd/BookCard.tsx` — expandable book card
- `components/nd/BooksPage.tsx` — page layout, search, filter
- `lib/search.ts` — client-side search logic
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/books-catalog.md
git commit -m "docs: add books-catalog feature documentation"
```

---

## Task 3: docs/features/admin-panel.md

**Files:**
- Create: `docs/features/admin-panel.md`

- [ ] **Step 1: Create the file**

```markdown
# Admin Panel

## What it does
Lets admins manage club members and the books catalog. Tabs: "Участники" (members list with signups) and "Книги" (books with per-book member lists). Admins can delete members, change book statuses, set new/not-new flags, add/remove books, and sync data from Google Sheets.

## How it works
- **Access control** — `session.user.isAdmin` checked server-side; non-admins receive 403 from all `/api/admin/*` routes
- **Members tab** — shows all `UserSignup` records (from `lib/signups.ts`); admin can delete user via `DELETE /api/admin/delete-user`
- **Books tab** — lists books from Google Sheets + DB statuses; per-book member list shows who signed up
- **Book statuses** — `book_statuses` table stores `reading` | `read` status per book; updated via `PATCH /api/admin/book-status`
- **New flags** — `book_new_flags` table; toggled via `PATCH /api/admin/book-new-flag`
- **Tag descriptions** — `tag_descriptions` table; editable inline via `PATCH /api/admin/tag-description`
- **Sheets sync** — `POST /api/sync` triggers re-fetch from Google Sheets; updates local DB state
- **Priority display** — `AdminStatusBar` shows digest queue size and top priority books per user

## Key files
- `components/nd/AdminPanel.tsx` — main admin UI (tabs, member list, book list)
- `components/nd/AdminStatusBar.tsx` — digest queue stats
- `app/api/admin/` — all admin API routes (book-status, book-new-flag, delete-user, tag-description, priorities, submissions, etc.)
- `lib/signups.ts` — `fetchSignups()`, `UserSignup` type
- `lib/db/schema.ts` — `bookStatuses`, `bookNewFlags`, `tagDescriptions`, `bookPriorities` tables
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/admin-panel.md
git commit -m "docs: add admin-panel feature documentation"
```

---

## Task 4: docs/features/notifications.md

**Files:**
- Create: `docs/features/notifications.md`

- [ ] **Step 1: Create the file**

```markdown
# Notifications (Digest)

## What it does
When a user joins a book's reading list (signup), an email notification is queued for each existing member of that book. Every 10 minutes a cron job sends out pending notifications in batches. Members get a digest email listing new sign-ups with their contacts.

## How it works
- **Queue** — `notification_queue` table in Neon Postgres; one row per pending notification. Fields: `userName`, `userEmail`, `contacts`, `addedBooks` (JSON), `recipientEmail`, `recipientName`, `status` (`pending` | `sent` | `failed`), `createdAt`, `sentAt`
- **Enqueue** — when a user signs up for a book, `POST /api/signup` inserts rows into `notification_queue` for all existing members of that book
- **Cron trigger** — GitHub Actions `digest.yml` calls `GET /api/cron/digest` with `Authorization: Bearer $CRON_SECRET` every 10 minutes
- **Processing** — `/api/cron/digest` fetches all `pending` rows, groups by `recipientEmail`, sends one email per recipient via Resend, marks rows as `sent`
- **Email** — HTML template in `lib/email-templates/`; lists new members and their contacts
- **DigestStatusWidget** — admin-only component showing queue size and last-sent timestamp

## Key files
- `lib/db/schema.ts` — `notificationQueue` table
- `app/api/cron/digest/route.ts` — digest endpoint (processes queue, sends emails)
- `app/api/signup/route.ts` — enqueues notifications on signup
- `lib/email-templates/` — Resend HTML templates
- `.github/workflows/digest.yml` — cron trigger (every 10 minutes)
- `components/nd/DigestStatusWidget.tsx` — admin queue stats UI
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/notifications.md
git commit -m "docs: add notifications feature documentation"
```

---

## Task 5: docs/features/user-profile.md

**Files:**
- Create: `docs/features/user-profile.md`

- [ ] **Step 1: Create the file**

```markdown
# User Profile

## What it does
Logged-in users can view and edit their profile via a slide-in drawer. The drawer has three tabs: personal info (name, contacts), book priorities (drag-to-rank), and language preferences.

## How it works
- **ProfileDrawer** — client component (`components/nd/ProfileDrawer.tsx`); opens via header avatar click
- **ContactsForm** — auto-opens for logged-in users who have no profile data yet (`isLoggedIn && !currentUser && !savedUser`); collects name and contact info
- **Profile data** — stored in `users` table (`name` field); additional contacts likely in user record or separate field
- **Book priorities** — `book_priorities` table (`userId`, `bookName`, `rank`, `updatedAt`); updated via `POST /api/priorities`; displayed as rank numbers next to books (shown as `—` before first ranking)
- **Languages** — user language preferences stored in `users` table or session
- **Sign out** — available from drawer; calls NextAuth `signOut()`

## Key files
- `components/nd/ProfileDrawer.tsx` — drawer shell (tabs, open/close)
- `components/nd/ContactsForm.tsx` — name + contacts form (auto-opens for new users)
- `app/api/profile/route.ts` — GET/PATCH user profile data
- `app/api/priorities/route.ts` — GET/POST book priority rankings
- `lib/db/schema.ts` — `bookPriorities` table, `users.name`
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/user-profile.md
git commit -m "docs: add user-profile feature documentation"
```

---

## Task 6: GitHub Actions wiki-sync workflow

**Files:**
- Create: `.github/workflows/wiki-sync.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Wiki Sync

on:
  push:
    branches: [main]
    paths:
      - 'docs/features/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Clone wiki repo
        run: |
          git clone "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/bon2362/book-club.wiki.git" wiki
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Copy feature docs to wiki
        run: |
          cp docs/features/*.md wiki/

      - name: Generate Home.md
        run: |
          DATE=$(date +%Y-%m-%d)
          cat > wiki/Home.md << EOF
# Book Club — Feature Documentation

> Auto-generated from \`docs/features/\`. To edit, modify files in \`docs/features/\` and push to \`main\`.

## Features

- [Authentication](auth) — Google OAuth, magic link, NextAuth v5
- [Books Catalog](books-catalog) — Google Sheets, covers, BookCard
- [Admin Panel](admin-panel) — moderation, priorities, stats
- [Notifications](notifications) — digest queue, cron, Resend
- [User Profile](user-profile) — drawer, tabs, priorities

_Last updated: ${DATE}_
EOF

      - name: Commit and push wiki
        run: |
          cd wiki
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .
          git diff --staged --quiet || git commit -m "docs: sync from docs/features/ [skip ci]"
          git push
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/wiki-sync.yml
git commit -m "feat: add GitHub Actions wiki sync workflow (#76)"
```

---

## Task 7: Push and verify

- [ ] **Step 1: Push to main**

```bash
git push
```

- [ ] **Step 2: Verify workflow ran**

Go to https://github.com/bon2362/book-club/actions — look for "Wiki Sync" workflow run. Check it completed successfully.

- [ ] **Step 3: Verify Wiki**

Go to https://github.com/bon2362/book-club/wiki — you should see the Home page with links to all 5 feature pages.

- [ ] **Step 4: Close issue**

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
gh issue close 76 --repo bon2362/book-club --comment "Реализовано в коммитах: docs/features/*.md + .github/workflows/wiki-sync.yml. Wiki: https://github.com/bon2362/book-club/wiki"
```

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

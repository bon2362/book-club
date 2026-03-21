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

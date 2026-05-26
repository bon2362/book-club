# Group Matching Mode Plan

GitHub Issue: https://github.com/bon2362/book-club/issues/159

## Motivation

Book selection and group formation are two different moments in the user journey.

During normal catalog browsing, users should be free to add books they genuinely want to read without immediately seeing whether other people have already selected the same book. Showing intersections too early can discourage exploration: if a user sees that nobody has voted for a book yet, they may skip a book they otherwise would have chosen because the social proof looks weak.

The matching experience should therefore be a separate mode: after users have selected and ranked books, they can enter a coordination space where intersections are visible, ranks can be adjusted, and possible reading groups update live.

## Product Goal

Create a dedicated matching mode where participants can:

- See their ranked book list.
- Reorder books by drag and drop.
- Add or remove books from the matching list.
- See possible groups of three.
- See lightweight live updates when other users add or remove books.
- Use group suggestions to coordinate without turning the catalog itself into a popularity contest.

## Core UX Principles

- Normal catalog selection remains personal and low-pressure.
- Matching mode is explicitly collaborative and social.
- Users edit only their own list.
- Admin-only controls are hidden behind settings or admin affordances.
- Scenario metrics are available for diagnostics but not foregrounded for regular users.
- The main scenario ranking prioritizes including more participants before optimizing quality.

## Data Model

Reuse existing data where possible:

- `signup_books`: user-book membership.
- `book_priorities`: ranked preference per user and book.
- `books`: catalog data, cover, status, description, tags.
- `users`: display name and contact metadata.

Potential additions:

- `matching_sessions`: optional future table for matching rounds, deadlines, status, and selected final groups.
- `matching_activity_events`: optional future table for persistent realtime feed events.

For the first implementation, matching can operate on the current global signup/ranking state without a new session table, but a session abstraction will become useful once there are multiple rounds or historical archives.

## Matching Rules

Initial scope:

- Group size: exactly 3 people.
- A user can appear in only one group per scenario.
- A book can appear once per scenario.
- Published books are shown, including books with no current signups.
- Books with `reading_status = 'reading'` remain visible and are marked as reading.

Interest labels in the scenario UI:

- Rank 1-3: `хочу читать`.
- Rank 4+: `готов(а)`.
- No rank: `готов(а) без ранга`.

Scenario sorting:

1. Maximize covered participants.
2. Maximize `хочу читать` count.
3. Minimize average rank among ranked participants.
4. Minimize worst rank.
5. Minimize participants without rank.

Admin/debug metrics:

- Strong interest count.
- Average rank.
- Worst rank.
- Participants without rank.

These should be hidden from the primary user view and exposed only via tooltip or admin/debug view.

## Realtime Feed

The feed should be optional and hidden by default.

Events to show:

- User added a book.
- User removed a book.
- A new group became possible.
- A previously possible group disappeared.

The feed should not create a page-level scroll. When opened, it appears above the user list and compresses the list area below it.

Example copy:

- `Мария добавила книгу "Патриот" — стала возможна новая группа.`
- `Евгений убрал книгу "Моя любимая страна" — одна из групп распалась.`
- `Ваня добавил книгу "Будущая революция" — новых групп не появилось.`

## UI Structure

Header:

- Product title.
- Feed toggle.
- Settings/admin toggle.

Main area:

- Optional feed.
- `Мой список`: ranked list with drag-and-drop.
- `Сценарии групп`: best matching scenarios.
- `Мои ходы`: books where the current user can complete a group.

Book rows:

- Cover thumbnail.
- Title and author.
- Status badge (`reading` when applicable).
- User interest chips.
- Rank number for selected books.
- `Хочу читать` action for unselected books.
- Remove action for selected books.

Book details:

- Clicking a book title opens a modal with cover, author, metadata, tags, description, and `why_read`.

## Technical Approach

### Phase 1: Server-rendered matching page

- Add route: `/matching` or `/groups/matching`.
- Server-load published books, current signups, priorities, and current user.
- Render initial state with existing Next.js/React components where possible.
- Keep catalog page behavior unchanged.

### Phase 2: Client interaction

- Add a client component for matching mode.
- Use drag-and-drop for rank reorder.
- Reuse or adapt existing priority API if available.
- Add add/remove book actions using existing signup APIs or a dedicated matching endpoint.
- Optimistically update local state, then persist.

### Phase 3: Scenario engine

- Implement a pure utility that takes books, users, signups, and ranks and returns ranked scenarios.
- Unit-test:
  - groups of exactly 3;
  - no repeated users in a scenario;
  - sorting by coverage first;
  - rank 1-3 maps to `хочу читать`;
  - books without signups remain addable but do not form groups.

### Phase 4: Realtime feed

Options:

- Lightweight polling endpoint for first release.
- Server-Sent Events if we want simple push.
- Pusher/Liveblocks/Supabase Realtime if we want stronger presence/collaboration later.

Recommended first step: polling every 5-10 seconds plus optimistic local feed entries. It is simpler, easier to deploy on Vercel, and enough to validate the product behavior.

### Phase 5: Persistence and audit

- Store activity events if feed should persist across refreshes.
- Otherwise keep feed ephemeral for MVP.
- If matching rounds become formal, introduce `matching_sessions`.

## API Sketch

Possible endpoints:

- `GET /api/matching/state`
  - Returns books, participants, current user's ranks, scenario suggestions, and recent feed events.

- `POST /api/matching/books`
  - Adds a book to current user's matching list.

- `DELETE /api/matching/books/:bookId`
  - Removes a book from current user's matching list.

- `PATCH /api/matching/priorities`
  - Persists reordered ranks.

- `GET /api/matching/events`
  - Returns recent activity events for polling or SSE.

## Testing

Unit tests:

- Scenario generation and sorting.
- Rank normalization after add/remove/reorder.
- Activity event classification: new group appeared, group disappeared, no group change.

E2E tests:

- User opens matching mode and sees their ranked list.
- User drags a book and rank persists after reload.
- User adds a book, reloads, and it remains in the list.
- User removes a book, reloads, and it stays removed.
- A book with no signups can be added.
- A realtime/polling feed event appears after another user's update.

UI layout tests:

- Feed hidden: no vertical page scroll on desktop.
- Feed open: feed appears above `Мой список`, list compresses, no page-level vertical scroll.
- Section bottom borders remain visible.

## Rollout

1. Ship matching page behind an admin-only or feature-flagged entry point.
2. Test with current participant data.
3. Let a small group try the matching mode.
4. Decide whether to add persistent matching sessions.
5. Add public navigation entry when behavior feels clear.

## Open Questions

- Should matching rounds have deadlines?
- Should users see contacts in matching mode or only names?
- Should `reading` books be included by default or visually deprioritized?
- Should “without rank” count as `готов(а)` forever, or should users be prompted to rank before participating?
- Should final group assignment be an admin action or a participant-confirmed action?

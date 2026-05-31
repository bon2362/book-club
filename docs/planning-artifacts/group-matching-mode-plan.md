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
- See possible groups (default size 3).
- See live updates when other users add, remove, or reorder books — without reloading the page and with minimal delay.
- See who is currently online (Google-Docs-style presence indicators).
- Use group suggestions to coordinate without turning the catalog itself into a popularity contest.

Realtime is a core requirement, not a nice-to-have: every change made by any participant (add, remove, rank reorder, presence) must propagate to all open matching pages as fast as practical, and scenario cards / `Мои ходы` must recompute in place. Users should never need to refresh.

## Core UX Principles

- Normal catalog selection remains personal and low-pressure.
- Matching mode is explicitly collaborative and social.
- Users edit only their own list.
- Admin-only controls are hidden behind settings or admin affordances.
- Scenario metrics are available for diagnostics but not foregrounded for regular users.
- The main scenario ranking prioritizes including more participants before optimizing quality.
- Real-time transparency of the "winning" scenario is preferred over hiding it, even though it creates some strategic-ranking pressure. Pseudonyms and owner-controlled session freeze mitigate the worst manipulation.

## Shared State with the Catalog

This is the most important design decision in the plan and the one most likely to be misread later: **matching mode does not have its own shadow tables for books, signups, or ranks.** It reads and writes the same `signup_books` and `book_priorities` rows that the catalog page uses.

Implications:

- Adding a book in matching mode adds it to the user's catalog state. Reordering in matching mode reorders the user's catalog priorities. There is no isolation.
- A new matching session does not snapshot user state. Books and ranks carry over from whatever the user had before the session started, and from whatever they had at the end of the previous session.
- The session abstraction is purely a coordination layer: who is participating, what pseudonyms they have, what the deadline is (advisory), and what scenario was frozen as the final pick.
- When a session is frozen, we persist the chosen scenario in the session row, but we do **not** snapshot `signup_books` / `book_priorities`. Historical "what did Маша's list look like during session N" is therefore not recoverable beyond the frozen scenario.

If we later decide we need per-session isolation, that is a separate, larger change. The current plan deliberately keeps it simple.

## Data Model

### Reused tables

- `signup_books` (existing): composite PK `(user_id, book_id)`, `signed_at`. Membership only — no rank.
- `book_priorities` (existing): composite PK `(user_id, book_id)`, `rank integer NOT NULL`, `updated_at`. Rank values are arbitrary integers; uniqueness per user is not enforced by the schema, and there is no row when a user has no rank for a book.
- `books`, `users`: read-only context.

### Invariants on the existing tables (enforced by matching code)

- A book can appear in `book_priorities` for a user only if the same `(user_id, book_id)` exists in `signup_books`. Matching mode "remove book" deletes from both. Matching mode "add book" inserts into `signup_books` only; the user can optionally rank it.
- After every rank-write, ranks for that user are normalized server-side to a dense `1..N` sequence. This keeps "Rank 1-3 = хочу читать" semantically stable across edits and avoids accidental ties.

### New tables

```text
matching_sessions
  id              text PK
  name            text NOT NULL
  created_by      text references users(id)
  created_at      timestamp NOT NULL default now()
  deadline_at     timestamp NULL          -- advisory only; does not auto-freeze
  status          text NOT NULL           -- 'active' | 'frozen'
  target_group_size integer NOT NULL default 3
  frozen_at       timestamp NULL
  frozen_scenario_json jsonb NULL         -- the final pick captured at freeze time

matching_session_participants
  session_id      text references matching_sessions(id) on delete cascade
  user_id         text references users(id) on delete cascade
  pseudonym       text NOT NULL           -- e.g. 'Барсук', unique per session
  joined_at       timestamp NOT NULL default now()
  PK (session_id, user_id)
  UNIQUE (session_id, pseudonym)

admin_views (audit log for `?as=`)
  id              text PK
  admin_id        text references users(id)
  viewed_user_id  text references users(id)
  session_id      text references matching_sessions(id) NULL
  ts              timestamp NOT NULL default now()
```

There is intentionally no `matching_activity_events` table in v1. The realtime feed is ephemeral (server in-memory ring buffer, scoped per session, max ~100 events). If we later need persistent audit of who-did-what during a session, that is a separate addition.

## Sessions and Lifecycle

A session is the unit of coordination. Without a session there is no matching page to open.

- **Creation**: only admin. Required fields: `name`, `target_group_size` (default 3). Optional: `deadline_at`.
- **Joining**: any authenticated user can join an `active` session via the matching page URL. Joining inserts a `matching_session_participants` row with a randomly-assigned animal pseudonym (see Pseudonyms).
- **Deadline behavior**: the deadline is **advisory** — it is visible to participants as a countdown but does not automatically freeze the session. The admin freezes manually.
- **Freezing**: admin presses "зафиксировать". Server captures the current top-sorted scenario into `frozen_scenario_json`, sets `status='frozen'` and `frozen_at`. From this point all mutation endpoints reject writes against this session.
- **After freeze**: the session is read-only forever. Pseudonyms and the frozen scenario remain visible for archive/review.
- **New session**: only admin can create a new one. Each new session generates new pseudonyms; user book/rank state carries over (see Shared State).
- **At most one `active` session at a time** — enforced as a partial unique index `WHERE status='active'`. This avoids ambiguity about which session a given matching-page action belongs to.

## Matching Rules

- **Group size**: defaults to 3, configurable per session via `target_group_size`. Engine logic is parameterized but the v1 UI assumes 3.
- A user can appear in only one group per scenario.
- A book can appear once per scenario.
- Published books are shown; books with no current signups are visible in catalog list but **excluded from scenario generation** (no group of 3 can include zero-signup books).
- **Books with `reading_status='reading'` are excluded from scenario generation.** They remain visible in the personal list with a "читается" badge; they cannot be the basis for new groups.

Interest labels in the scenario UI:

- Rank 1-3: `хочу читать`.
- Rank 4+: `готов(а)`.
- Signup without rank row: `готов(а) без ранга`. Participants without ranks are eligible to be placed in scenarios. The UI shows a non-intrusive nudge ("расставь ранги, чтобы улучшить выбор") but does not block participation.

Scenario sorting (lexicographic, top wins):

1. Maximize covered participants.
2. Maximize `хочу читать` count.
3. Minimize average rank among ranked participants.
4. Minimize worst rank.
5. Minimize participants without rank.

Admin/debug metrics (hidden by default, exposed via tooltip): strong-interest count, average rank, worst rank, participants without rank.

## Final Decision Rules

The matching page is also a transparent decision tool.

Rule: the scenario sorted first by the criteria above is the **current leader**. When the admin freezes the session, the leader at freeze time becomes the final pick. The current leader updates in real time as participants change ranks or membership.

Scenario card colors:

- **Winning scenario** (top of the sorted list): distinct highlight color — this is the current leader and will be chosen if frozen now.
- **Other scenarios with maximum achievable coverage**: a second highlight color. When `N % group_size == 0` this means 100% coverage. When it does not, this is the best achievable (e.g. for `N=10, group_size=3` it is 9-of-10) — same color, since "everyone we could possibly include" is the meaningful threshold, not "literally 100%".
- **Scenarios with sub-maximum coverage** (someone left out who could otherwise be included): neutral beige — visible for context but de-emphasized.

The color coding makes the consequence of every rank change immediately legible: users can see when their move pushes a scenario into the "best-achievable coverage" tier or knocks one out of it.

### Game-theory note

Showing the leader in real time creates an incentive to adjust ranks strategically to lock in or knock out a specific configuration. We accept this trade-off because (a) pseudonyms make targeted manipulation harder, (b) the admin owns the freeze moment so timing is not a participant lever, (c) transparency is more valuable for trust than for protecting against gaming in a club of friends. Revisit if observed manipulation becomes a problem.

## Access Model and Identity

The matching page is public to any authenticated user once a session is active (no whitelist). Identity is presented through per-session pseudonyms.

- Pseudonyms are single-word animals from a curated Russian-language dictionary of 200+ entries (e.g. `Барсук`, `Выдра`, `Лис`, `Рысь`, `Бобр`). Dictionary size is chosen to be safely larger than any realistic participant count, so collisions never require numeric suffixes.
- A pseudonym is **assigned on first join and stable for the lifetime of the session**. It survives reloads, logout/login, and switching devices because it lives in `matching_session_participants`.
- Each new session generates a fresh random pseudonym for every participant; there is no long-term mapping participants can memorize.
- Pseudonyms are unique within a session (enforced by `UNIQUE (session_id, pseudonym)`).

### Identity asymmetry — honest framing

Anonymity is **between participants only**. The admin can see the mapping between real names and pseudonyms in the admin UI (e.g. participant cards show `Мария · Барсук`). The system therefore offers:

- Strong anonymity peer-to-peer.
- No anonymity from the owner.

This is documented to participants in a short note on the matching page so the privacy promise is not misread.

### Presence (online indicators)

Each connected client emits a heartbeat over the SSE channel every 25 seconds. The server maintains a per-session online set and broadcasts presence updates. The UI shows a small dot or chip on each participant's pseudonym when they are connected. Disconnect detection: missing two heartbeats (≥55 seconds).

## Admin View

The owner needs visibility into what each participant sees and a controlled way to fix participant lists during facilitation.

- Admin can open any participant's view of the current session: their personal list, their ranks, the scenarios they'd see, the `Мои ходы` they'd see.
- Admin can add/remove books, reorder ranks, and change statuses for the viewed participant from this view. The UI marks this as admin mode.
- Admin's own presence does not appear in the impersonated user's online indicator (admin views are silent).

## Security and `?as=` Mechanics

Admin impersonation is a known-dangerous pattern. The plan commits to specific controls:

- **Server-enforced role check** for any request carrying `?as=<userId>`. If the caller is not admin, mutation endpoints reject with `403`; read endpoints ignore the parameter and proceed as the caller's own identity.
- **Controlled impersonated mutations**: personal matching mutations accept `?as=<userId>` only for admins, so the owner can facilitate by editing participant lists and ranks.
- **Audit log**: every successful impersonated read inserts an `admin_views` row (`admin_id`, `viewed_user_id`, `session_id`, `ts`). The admin sees their own log in a debug panel.
- **Read-only SSE channel for impersonated views**: the impersonation endpoint subscribes to the broadcast channel but the server marks the connection as no-emit (admin's heartbeat does not register in the target user's presence).
- **No `as=` via cookies or session state** — it's always a query parameter on the request, so a forgotten admin tab cannot silently mutate state on the next click.

## Concurrency Model

Realtime collaboration without a concurrency story is a regression waiting to happen. The plan commits to a simple, predictable model:

- **Last-write-wins per `(user_id, book_id)` cell.** Two writes for the same cell — the later `updated_at` wins. We do not attempt OT or CRDT semantics.
- **Server-side rank normalization** runs on every `PATCH /api/matching/priorities`. After the write, ranks for that user are renumbered `1..N` densely in the order specified by the client payload. This avoids gaps, ties, and race-induced rank duplication.
- **Atomic per-user transaction**: each write is a single transaction touching only that user's rows. No cross-user locking.
- **Optimistic UI**: client applies the change immediately, then reconciles with the server response. On conflict (e.g. user removed a book that was already removed), the server returns the canonical state and the client snaps to it.
- **SSE event ordering**: every broadcast event carries a monotonic `event_id`. Clients drop out-of-order or duplicate events using this id.

## Realtime Architecture

### Transport

- **Primary**: Server-Sent Events. One long-lived connection per open tab, scoped to the active session.
- **Heartbeat**: server pings every 25 seconds to keep the connection warm and to drive presence.
- **Max connection lifetime**: 5 minutes server-side; client auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, capped at 30s).
- **Connection budget**: cap of 50 concurrent SSE connections per session at the function layer. Above the cap, new clients fall back to polling. For a club of <30 active participants this is comfortable headroom.
- **Fallback**: polling `/api/matching/state` at 3-second intervals when SSE fails or is unsupported.

### What flows over the channel

Per-session broadcast events:

- `state_changed`: payload is a diff or version pointer; clients re-fetch state or apply the diff.
- `presence`: list of currently-online pseudonyms.
- `feed_event`: classified event for the optional feed (see Realtime Feed).
- `session_frozen`: emitted once when admin freezes; clients switch to read-only UI.

### Scenario engine on the server

Scenario recomputation runs server-side on every mutation, not per-client. Result is pushed; clients render. This keeps the engine logic in one place and avoids 20 clients each computing the same combinatorial result.

## Scenario Engine Complexity

The engine builds candidate groups of `target_group_size` participants around books that have ≥`target_group_size` signups.

- **Naive bound**: `O(C(N, 3) * M)` for N participants, M eligible books. For N=30, M=50 that's ~200k * 50 = 10M operations — too slow for an interactive realtime path.
- **Pruning**:
  - Per book, only consider participants who actually signed up for that book. The candidate pool per book is bounded by signup count, not N.
  - Reject candidate groups by coverage upper bound before scoring (if the partial group cannot beat the current best, skip).
  - Cap output to top 10 scenarios per response.
- **Target performance**: p95 < 200ms server-side for realistic sizes (N≤30, M≤50). If exceeded, fall back to a heuristic that fixes book-by-book and assigns participants greedily by rank.
- **Unit-tested perf assertion** in CI: run engine on fixture with N=30 / M=50 and assert wall time under threshold.

## UI Structure

Header:

- Session name + deadline countdown (when present).
- Feed toggle.
- Admin tools toggle (only visible to admin).
- Presence indicator strip (online pseudonyms).

Main area:

- Optional feed.
- `Мой список`: ranked list with drag-and-drop.
- `Сценарии групп`: best matching scenarios, color-coded.
- `Мои ходы`: books where the current user can complete a group.

Book rows:

- Cover thumbnail.
- Title and author.
- Status badge (`reading` when applicable, but not selectable for scenarios).
- Participant interest chips (pseudonyms).
- Rank number for ranked books.
- `Хочу читать` action for unselected books.
- Remove action for selected books.

Book details:

- Clicking a book title opens a modal with cover, author, metadata, tags, description, and `why_read`.

## Accessibility and Mobile

- **Drag-and-drop via `@dnd-kit`**, which is already in the project. Use its keyboard sensor: arrow keys reorder when the row is focused; space toggles grab.
- **Screen reader announcements** on every reorder ("Книга X перемещена на позицию Y").
- **Touch sensor** enabled for mobile; reorder works via long-press + drag.
- **Fallback for users who cannot drag**: a "move up / move down" pair of buttons on each row, visible by default on touch, available via keyboard on desktop.

## Realtime Feed

Optional, hidden by default. Server-side ring buffer (last 100 events per session), no DB table in v1.

Events:

- User added a book.
- User removed a book.
- A new group became possible.
- A previously possible group disappeared.

The feed should not create a page-level scroll. When opened, it appears above the user list and compresses the list area below it.

### Event classification

Classification ("новая группа стала возможна" vs "одна из групп распалась") is done server-side by diffing the scenario set before and after the mutation, against a session-level previous-state snapshot (not per-recipient). New joiners simply see the most recent events from the ring buffer.

Deduplication: if multiple users act in the same 1-second window, events are coalesced into a single feed entry where possible.

Example copy:

- `Барсук добавил книгу "Патриот" — стала возможна новая группа.`
- `Выдра убрала книгу "Моя любимая страна" — одна из групп распалась.`
- `Метеор добавил книгу "Будущая революция" — новых групп не появилось.`

## Technical Approach

### Phase 1: Session and schema foundation

- Drizzle migration adding `matching_sessions`, `matching_session_participants`, `admin_views`.
- Admin UI: create / freeze session.
- Route `/matching` — 404 unless admin (feature gate v1).
- Pseudonym dictionary in `lib/matching/pseudonyms.ts`.

### Phase 2: Server-rendered matching page

- Page loads active session, published books, current user's signups+ranks, all participants' signups+ranks (with pseudonyms).
- Initial scenarios computed server-side and rendered.

### Phase 3: Client interaction

- `@dnd-kit` reorder, add/remove via existing-pattern API.
- Server normalizes ranks on every PATCH.
- Optimistic UI with reconciliation on server response.

### Phase 4: Scenario engine

- Pure utility `lib/matching/scenarios.ts`.
- Bounds and pruning as in Scenario Engine Complexity.
- Color-tier classification: leader / max-coverage / sub-max.

### Phase 5: Realtime

- SSE endpoint `/api/matching/stream`.
- Heartbeat, presence, broadcast on every mutation.
- Polling fallback `/api/matching/state` at 3s.

### Phase 6: Feed and freeze

- Ring buffer + event classification.
- Admin "зафиксировать" → capture leader, set `status='frozen'`.
- Clients receive `session_frozen` and switch to read-only.

## API Sketch

All endpoints check active session existence and (for mutations) `status='active'`. Personal mutation endpoints accept `?as=<userId>` only for admins.

- `GET /api/matching/state?session=<id>` — full state for current user including scenarios, presence snapshot, recent feed.
- `POST /api/matching/sessions` — admin only, creates session.
- `POST /api/matching/sessions/:id/freeze` — admin only.
- `POST /api/matching/sessions/:id/join` — current user joins, gets pseudonym.
- `PATCH /api/matching/sessions/:id` — admin only, updates `target_group_size` for an active session.
- `POST /api/matching/books` — adds book to current user's signup, or to `?as=<userId>` for admins.
- `DELETE /api/matching/books/:bookId` — removes book from current user, or from `?as=<userId>` for admins.
- `PATCH /api/matching/priorities` — accepts ordered list `[bookId, ...]`, server normalizes ranks to dense `1..N`; supports admin `?as=<userId>`.
- `GET /api/matching/stream?session=<id>` — SSE.

## Feature Gate

For the first release, access is gated by NextAuth role check:

- `/matching` page server-side check: redirect non-admins to `/`.
- All `/api/matching/*` endpoints check role before processing.
- When ready to open to participants, the gate is loosened to "authenticated AND member of an active session" — no new infra required.

## Success Metrics

To later evaluate whether matching mode works, we track per session:

- Number of groups in the frozen scenario.
- Coverage of the frozen scenario (covered / total participants).
- Time from session creation to freeze.
- Time from last mutation to freeze (proxy for "did discussion settle?").
- Share of participants whose top-3 ranked book appears in the frozen scenario.

These are stored on the session row at freeze time (denormalized) for simple admin reporting.

## Data Retention

- `matching_sessions` and `matching_session_participants`: kept indefinitely.
- `admin_views`: kept indefinitely (low-volume audit log).
- Feed events: in-memory only, lost on server restart. Acceptable for MVP.

If a participant requests deletion of their data:

- Pseudonyms are not PII (random animals), so the `matching_session_participants` row can stay with the user reference nulled, preserving session history.
- `signup_books` / `book_priorities` rows are subject to the existing user-deletion flow; matching does not introduce new retention obligations.

## Testing

### Unit tests

- Scenario generation: groups of size N, no repeated users, coverage-first sorting.
- Rank normalization: dense `1..N` after every PATCH, including pathological inputs (gaps, ties, negatives).
- Color tier classification (leader / max-coverage / sub-max) including the `N % group_size != 0` case.
- Feed event classification: new group / group disappeared / no change.
- Pseudonym assignment: uniqueness within session, no collisions on N=30 against a 200-word dictionary.
- Scenario engine performance: p95 < 200ms on N=30, M=50 fixture.

### Integration / security tests

- `?as=<userId>` allowed only for admins.
- Personal mutation endpoints with `?as=` mutate the viewed participant for admins and return `403` for non-admins.
- `admin_views` row inserted on every successful impersonated read.
- Mutation endpoints reject when session `status='frozen'`.
- Only one `active` session at a time (DB constraint).

### E2E tests

- User opens matching page during an active session, gets a pseudonym, sees their list.
- User drags a book, rank persists after reload.
- User adds a book, reloads, it remains.
- User removes a book, reloads, stays removed.
- A `reading` book is visible in personal list but absent from scenarios.
- Two browser contexts: user A adds a book, user B sees the scenario tier change without reload.
- SSE reconnects after server restart and resumes presence within ~10s.
- Admin freezes session, all clients switch to read-only UI.
- Admin opens `?as=<userId>` view and can add/remove books, reorder priorities, and change statuses for the viewed participant.
- Non-admin attempting `?as=` is silently downgraded to their own identity.
- New session: pseudonyms regenerate; user state (books, ranks) carries over.

### UI layout tests

- Feed hidden: no vertical page scroll on desktop.
- Feed open: feed appears above `Мой список`, list compresses, no page-level vertical scroll.
- Presence indicator: rendered next to pseudonyms, not in page flow.
- Mobile: drag handle reachable with thumb; "move up/down" buttons visible on touch.

## Rollout

1. Migrations + admin-only session create/freeze UI.
2. Matching page behind admin role check; admin tests end-to-end alone.
3. Admin invites a small set of beta participants to a real session.
4. Loosen gate to "authenticated AND in active session".
5. After 1-2 full sessions, review success metrics and decide on persistent activity events / shadow tables / OT-style concurrency if needed.

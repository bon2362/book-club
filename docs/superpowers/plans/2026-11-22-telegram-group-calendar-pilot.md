# Telegram Group Calendar Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a linked member of a book circle mark future availability directly in a bound Telegram forum topic, then open the same calendar grid in a Telegram Mini App.

**Architecture:** A new audited binding records which Telegram chat topic owns an announcement for a `circle_schedules` calendar. The webhook resolves a linked Telegram identity, validates membership and updates the existing global availability intervals; a pure selector supplies compact future candidates. The announcement uses Telegram inline callback buttons for quick choices and a Direct Link to a generic Mini App page that resolves the binding before reusing the current calendar client and APIs.

**Tech Stack:** Next.js 14 route handlers and client components, TypeScript, Drizzle/Postgres migrations, Jest, Playwright, Telegram Bot API and Telegram Mini App `initData`.

**Spec:** `docs/superpowers/specs/2026-11-22-telegram-group-calendar-pilot-design.md`

## Global Constraints

- Source of truth remains `user_availability`, `circle_schedules`, and `circle_meetings`; do not create a Telegram-specific availability table.
- Quick choices use only future full-duration slots, formatted in `Europe/Belgrade`; Mini App grid retains the viewer's profile timezone.
- Default candidates: within the next 14 days, Tuesday/Thursday 19:00 and Saturday/Sunday 12:00; render at most six nearest future defaults.
- Once any member has marked availability, replace defaults with at most six real selected future starts, ranked by count descending then start time ascending.
- A quick-button callback toggles only that duration block and must preserve all other availability intervals of the same user.
- A Telegram identity must already be linked to a site account and must belong to the current circle before it can read, toggle or refresh a topic calendar.
- Only a site administrator may bind or rebind a Telegram topic with `/calendar <slug>`.
- A forum topic may bind one schedule; the same schedule may bind multiple topics.
- New mutable data must use `withAuditContext`, be included in `AUDITED_TABLES`, and receive an `audit_capture()` trigger in the migration.
- Inline keyboard state is shared by the topic: callback toast is personal, message button labels expose aggregate counts only.
- Main Mini App opening uses a Direct Link with an opaque binding id; all authorization remains server-side.

## Review Focus

- A callback copied from another chat/topic must not update the bound calendar; Task 3 verifies callback-message chat and thread identifiers against the saved binding.
- A linked user outside the circle must receive no state and write no availability; Tasks 2–4 test this membership guard on every entry point.
- A callback must not erase a second, unrelated free interval; Task 2 tests add/remove against normalized multi-interval availability.
- Adjacent availability blocks and a scheduled meeting must not create an invalid quick choice; Task 2 tests full duration, past-time and meeting exclusions.
- A deleted Telegram announcement must recover by sending exactly one replacement and storing its new message id; Task 3 tests Bot API failure/repost behavior.

---

## File Structure

- `drizzle/0067_telegram_calendar_topics.sql` — creates the topic binding table, indexes and audit trigger.
- `lib/db/schema.ts` — Drizzle declaration for `telegramCalendarTopics`.
- `lib/audit/audited-tables.ts` — registry entry for the new table.
- `lib/calendar/telegram-quick-slots.ts` — pure candidate selection, presentation types and Belgrade formatting inputs.
- `lib/calendar/telegram-topic-calendar.ts` — binds topics, resolves bindings, validates callback origin, toggles one interval and produces an announcement model.
- `lib/calendar/telegram-quick-slots.test.ts`, `lib/calendar/telegram-topic-calendar.test.ts` — focused logic/service tests.
- `lib/calendar/calendar-actor.ts` — reusable resolver for a Bot API Telegram user id and new audit source `telegram-bot`.
- `lib/telegram-bot.ts` — typed `sendMessage`, `editMessageText` and `answerCallbackQuery` helpers, including `message_thread_id` and inline keyboards.
- `app/api/telegram/webhook/route.ts` and `route.test.ts` — command/callback dispatch, while retaining all current `/start` flows.
- `app/api/tg/calendar/topic/[bindingId]/route.ts` and `route.test.ts` — authenticated Mini App binding resolution (`GET`) and announcement refresh (`POST`).
- `app/tg/topic-calendar/page.tsx` and `components/nd/TelegramTopicCalendarClient.tsx` — generic Direct Link entry page, reads `start_param`, resolves the binding, then mounts the existing calendar client.
- `components/nd/TelegramTopicCalendarClient.test.tsx` — loading, invalid link and Mini App parameter tests.
- `e2e/telegram-calendar-topic-miniapp.spec.ts` — browser flow for the new Mini App entry route with Telegram SDK/API mocks.
- `docs/features/calendar.md`, `docs/features/auth.md`, `docs/wiki/Circle-Calendar.md`, `docs/wiki/Auth-and-Users.md` — user and technical operation instructions.

### Task 1: Persist topic bindings and expose a safe calendar actor

**Files:**
- Create: `drizzle/0067_telegram_calendar_topics.sql`
- Modify: `lib/db/schema.ts`, `lib/audit/audited-tables.ts`, `lib/calendar/calendar-actor.ts`, `drizzle/0040_audit_triggers.test.ts`
- Test: `lib/calendar/calendar-actor.test.ts`

**Interfaces:**
- Produces `telegramCalendarTopics` with `id`, `scheduleId`, `chatId`, `messageThreadId`, `announcementMessageId`, `createdAt`, `updatedAt`.
- Produces `resolveTelegramBotCalendarActor(telegramUserId: string): Promise<CalendarActor>` with `source: 'telegram-bot'`.
- Later tasks consume `CalendarActor`, the table and `telegramCalendarTopics.id` as the opaque Direct Link binding id.

- [ ] **Step 1: Write migration/schema tests first**

Add assertions that audit-table discovery includes `telegram_calendar_topics`, and actor tests that a linked identity resolves to `{ userId, name, isAdmin, source: 'telegram-bot' }` while an unknown ID gets `telegram_identity_not_linked`.

- [ ] **Step 2: Run focused tests to prove they fail**

Run: `npm test -- lib/calendar/calendar-actor.test.ts drizzle/0040_audit_triggers.test.ts`

Expected: FAIL because the bot resolver/table/audit trigger do not exist.

- [ ] **Step 3: Add migration and schema declaration**

Create `telegram_calendar_topics` with UUID/text `id`, FK `schedule_id → circle_schedules.id ON DELETE CASCADE`, string `chat_id`, integer `message_thread_id`, nullable integer `announcement_message_id`, timestamps, unique `(chat_id, message_thread_id)`, and an index on `schedule_id`. Add the audit trigger and registry entry. Do not add any token or personally sensitive column.

- [ ] **Step 4: Add the Bot API actor resolver**

Refactor the shared identity lookup from `resolveTelegramCalendarActor()` so Mini App `initData` and a webhook Telegram ID use one linked-identity lookup. Expand `CalendarActor.source` to include `'telegram-bot'`; do not loosen signature verification for Mini App requests.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- lib/calendar/calendar-actor.test.ts drizzle/0040_audit_triggers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit this isolated data layer**

Run lint and typecheck first, then commit with `feat(calendar): add telegram topic bindings`.

### Task 2: Select quick slots and safely toggle one availability block

**Files:**
- Create: `lib/calendar/telegram-quick-slots.ts`, `lib/calendar/telegram-quick-slots.test.ts`, `lib/calendar/telegram-topic-calendar.ts`, `lib/calendar/telegram-topic-calendar.test.ts`, `lib/calendar/calendar-service.test.ts`
- Modify: `lib/calendar/calendar-service.ts`

**Interfaces:**
- Consumes: `CalendarPublicState`, `CalendarActor`, `telegramCalendarTopics`, `addInterval`, `removeInterval`.
- Produces `selectTelegramQuickSlots(input): TelegramQuickSlot[]`, where each slot is `{ startsAt: Date; endsAt: Date; markedCount: number; selectedByViewer: boolean }`.
- Produces `bindTelegramTopic(input): Promise<TelegramTopicBinding>`, `getTelegramTopicBinding(id): Promise<TelegramTopicBinding | null>`, `toggleTelegramTopicSlot(input): Promise<TelegramTopicAnnouncement>` and `buildTelegramTopicAnnouncement(input): TelegramTopicAnnouncement`.
- Task 3 consumes `TelegramTopicAnnouncement` to build Bot API text and keyboard; Task 4 consumes binding resolution.

- [ ] **Step 1: Write failing pure-selector tests**

Use fixed time `2026-11-22T10:00:00.000Z` and a 60-minute duration. Assert: six nearest default Belgrade recurrence slots when every participant is unmarked; after an availability interval exists, no default appears; selected starts are ranked count then date; past starts and blocks overlapping an existing meeting are excluded; a one-hour click preserves another unrelated interval after toggle; a second toggle restores the prior interval list.

- [ ] **Step 2: Run selector tests to prove they fail**

Run: `npm test -- lib/calendar/telegram-quick-slots.test.ts lib/calendar/telegram-topic-calendar.test.ts`

Expected: FAIL because the selector and topic service do not exist.

- [ ] **Step 3: Implement the pure selector**

Generate default dates in `Europe/Belgrade` through existing timezone helpers, never by fixed UTC clock values. For real availability, enumerate aligned starts only when the entire schedule duration lies inside a participant interval; count eligible participants, reject starts before `now` and starts overlapping active `circleMeetings`, then sort and trim to six.

- [ ] **Step 4: Implement binding and toggle services**

`bindTelegramTopic` accepts `{ actor, chatId, messageThreadId, slug }`, rejects non-admin actors and absent/currently dissolved circles, upserts only the `(chatId, messageThreadId)` binding under `withAuditContext`. `toggleTelegramTopicSlot` validates binding + message origin + membership, reads the viewer's full current intervals, applies `addInterval` or `removeInterval` for exactly `durationMinutes`, and delegates the normalized full list to `saveCalendarAvailability` so unrelated intervals survive.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- lib/calendar/telegram-quick-slots.test.ts lib/calendar/telegram-topic-calendar.test.ts lib/calendar/calendar-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the domain layer**

Run lint and typecheck first, then commit with `feat(calendar): add telegram quick slot service`.

### Task 3: Publish and update the topic announcement through Telegram

**Files:**
- Modify: `lib/telegram-bot.ts`, `app/api/telegram/webhook/route.ts`
- Create: `lib/telegram-bot.test.ts`
- Modify: `app/api/telegram/webhook/route.test.ts`

**Interfaces:**
- Consumes: `bindTelegramTopic`, `toggleTelegramTopicSlot`, `buildTelegramTopicAnnouncement`, `resolveTelegramBotCalendarActor`.
- Produces Bot API helpers `sendTelegramTopicMessage`, `editTelegramTopicMessage`, `answerTelegramCallback` and `renderTelegramTopicKeyboard`.
- Produces webhook support for group `/calendar <slug>` commands and `callback_query` payloads `calendar:<bindingId>:<startsAtEpoch>`.
- Task 4 consumes the shared announcement refresh helper.

- [ ] **Step 1: Write failing webhook tests**

Mock bot calls and domain services. Cover: existing `/start` login and `link_` behavior stays unchanged; a site admin `/calendar zarya-vsego` in a forum topic creates one announcement; a non-admin receives a callback alert and no mutation; an ordinary non-command message is ignored; a callback whose `message.chat.id` or `message_thread_id` differs from the binding is rejected; a valid callback answers with personal `Отмечено`/`Снято` and edits the shared counts; an edit failure for a deleted message sends a replacement and stores its id.

- [ ] **Step 2: Run webhook test to prove it fails**

Run: `npm test -- app/api/telegram/webhook/route.test.ts`

Expected: FAIL because group command and callback dispatch are absent.

- [ ] **Step 3: Generalize the Telegram Bot API adapter**

Keep the existing direct-message login helper compatible. Add typed request functions for `sendMessage`, `editMessageText` and `answerCallbackQuery`; `sendMessage` must pass `message_thread_id` for a forum topic and return Telegram's `message_id`. Log only operation/status names, never bot token or raw callback data.

- [ ] **Step 4: Extend the webhook without changing login behavior**

Parse `message` and `callback_query` update shapes defensively. Handle `/start` first exactly as before. Accept `/calendar <slug>` only in `group`/`supergroup` messages with a `message_thread_id`; use the linked identity to authorize the site admin, bind/update and publish one announcement. For callbacks, validate payload, resolve actor and binding, validate source chat/topic, toggle, edit/repost announcement, then call `answerCallbackQuery` with personal feedback.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- app/api/telegram/webhook/route.test.ts lib/telegram-bot.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the bot integration**

Run lint and typecheck first, then commit with `feat(telegram): add topic calendar buttons`.

### Task 4: Open the full grid from the Telegram topic

**Files:**
- Create: `app/api/tg/calendar/topic/[bindingId]/route.ts`, `app/api/tg/calendar/topic/[bindingId]/route.test.ts`, `app/tg/topic-calendar/page.tsx`, `components/nd/TelegramTopicCalendarClient.tsx`, `components/nd/TelegramTopicCalendarClient.test.tsx`
- Modify: `components/nd/TelegramCalendarClient.tsx`, `components/nd/TelegramCalendarClient.test.tsx`
- Test: `e2e/telegram-calendar-topic-miniapp.spec.ts`

**Interfaces:**
- Consumes: the existing signed `Authorization: tma <initData>` verification, `resolveTelegramCalendarActor`, `getTelegramTopicBinding`, announcement refresh helper and `TelegramCalendarClient`.
- Produces `GET /api/tg/calendar/topic/[bindingId] → { slug: string }` and `POST /api/tg/calendar/topic/[bindingId] → { ok: true }`, both requiring linked membership.
- Produces `/tg/topic-calendar`, which extracts exactly `calendar_<bindingId>` from `Telegram.WebApp.initDataUnsafe.start_param` and mounts `TelegramCalendarClient` with the resolved slug.

- [ ] **Step 1: Write failing API/client tests**

Assert: missing or malformed `start_param` renders a readable error; the loader sends `Authorization: tma <initData>`; an unknown/foreign binding returns no slug; valid resolution mounts the existing calendar; after successful availability save the client calls the `POST` refresh endpoint; the existing slug route keeps its current request URLs unchanged.

- [ ] **Step 2: Run focused tests to prove they fail**

Run: `npm test -- app/api/tg/calendar/topic/'[bindingId]'/route.test.ts components/nd/TelegramTopicCalendarClient.test.tsx components/nd/TelegramCalendarClient.test.tsx`

Expected: FAIL because the binding route and loader do not exist.

- [ ] **Step 3: Implement authenticated binding API**

Use the current Mini App HMAC validation unchanged. `GET` resolves the saved binding then verifies the actor belongs to that schedule before returning only its slug. `POST` repeats the same check and refreshes the one announcement; if Telegram says it no longer exists, send a replacement in the original saved topic and persist its new id.

- [ ] **Step 4: Implement the generic Mini App loader**

Load the official Telegram SDK before hydration as the existing page does. Read `initData` and `start_param` only in the browser, validate prefix/shape locally, request the binding endpoint, and delegate screen rendering to the existing `TelegramCalendarClient`. Add optional `onSaved` callback to that existing client so only topic-launched instances request announcement refresh after a successful availability update or meeting operation.

- [ ] **Step 5: Add focused browser E2E**

Create a Playwright spec that injects a mock `window.Telegram.WebApp`, mocks binding/calendar APIs, opens `/tg/topic-calendar`, chooses a grid cell, reloads the page and verifies the mocked persisted interval is rendered. Verify the refresh endpoint request after save. This is a Mini App UI flow; use `waitForHydration` and wait on the mutation response rather than `networkidle`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- app/api/tg/calendar/topic/'[bindingId]'/route.test.ts components/nd/TelegramTopicCalendarClient.test.tsx components/nd/TelegramCalendarClient.test.tsx`

Then (with isolated E2E env symlinks): `PLAYWRIGHT_PORT=3100 npm run test:e2e:focused -- e2e/telegram-calendar-topic-miniapp.spec.ts`.

Expected: all PASS.

- [ ] **Step 7: Commit the Mini App entry**

Remove E2E env symlinks before unit tests, run lint and typecheck, then commit with `feat(telegram): open topic calendar mini app`.

### Task 5: Complete documentation, full verification and pilot release

**Files:**
- Modify: `docs/features/calendar.md`, `docs/features/auth.md`, `docs/wiki/Circle-Calendar.md`, `docs/wiki/Auth-and-Users.md`
- Test: `e2e/telegram-auth.spec.ts`, `e2e/telegram-calendar-miniapp.spec.ts`, `e2e/telegram-calendar-topic-miniapp.spec.ts`, relevant calendar Jest suites

**Interfaces:**
- Consumes all preceding tasks.
- Produces operating instructions for BotFather Main Mini App configuration, `/calendar <slug>` binding, topic privacy/admin expectations and the two-device test checklist.

- [ ] **Step 1: Update documentation**

Document the exact member and owner flows, that the chat’s fast labels use Belgrade time, the BotFather requirement for Main Mini App, and recovery via rerunning `/calendar <slug>` in the topic. State that bot admin rights are optional unless automatic pinning is later enabled.

- [ ] **Step 2: Run all affected unit tests**

Run: `npm test -- lib/calendar app/api/telegram app/api/tg/calendar components/nd/TelegramCalendarClient.test.tsx components/nd/TelegramTopicCalendarClient.test.tsx drizzle/0040_audit_triggers.test.ts`.

Expected: PASS.

- [ ] **Step 3: Run focused end-to-end checks**

With the temporary isolated E2E env symlinks, run:

`PLAYWRIGHT_PORT=3100 npm run test:e2e:focused -- e2e/telegram-auth.spec.ts e2e/telegram-calendar-miniapp.spec.ts e2e/telegram-calendar-topic-miniapp.spec.ts`

Expected: PASS. Remove both env symlinks immediately afterward.

- [ ] **Step 4: Run final project gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`.

Expected: all commands exit 0.

- [ ] **Step 5: Commit and deliver through PR**

Before commit, explicitly record: `E2E: нужен — новый Mini App UI и персистентная отметка` and `Wiki: нужна — новый пользовательский и операционный Telegram-flow`. Commit documentation/final glue, push the branch, create a PR, enable auto-merge and verify `mergeStateStatus`. Watch CI in the background and fix any CI result on this same PR branch.

## Self-review

- **Spec coverage:** Tasks 1–3 cover topic binding, inline buttons, one-source availability and security. Task 2 implements default/replaced quick-slot rules. Task 4 covers the overlay Mini App launch and state refresh. Task 5 covers the two-device pilot steps and documentation.
- **Step scan:** Each task starts from a focused failing test, defines exact public functions/routes, then verifies only its own deliverable before commit.
- **Type consistency:** Topic bindings are addressed everywhere by `bindingId`; announcement rendering accepts `TelegramTopicAnnouncement`; both Mini App handlers use the existing `CalendarActor` returned by signed `initData`.
- **Review focus:** Callback origin, membership, interval preservation, candidate validity and deleted-message recovery are assigned to Tasks 2–4 tests.
- **Proportion:** Five independently testable deliverables map one-to-one to persisted data, pure domain logic, Bot API webhook, Mini App UI and release verification.

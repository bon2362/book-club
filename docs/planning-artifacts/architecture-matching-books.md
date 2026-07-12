---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - 'docs/planning-artifacts/prd-matching-books.md'
  - 'docs/brainstorming/brainstorming-session-2026-07-12-195055.md'
  - 'docs/features/matching.md'
  - 'docs/planning-artifacts/scenario-based-matching-ux-spec.md'
  - 'docs/project-context.md'
workflowType: 'architecture'
project_name: 'book-club'
featureName: 'book-centered-matching'
user_name: 'Evgenii'
date: '2026-07-12'
lastStep: 8
status: 'complete'
completedAt: '2026-07-12'
---

# Architecture Decision Document — книжный режим Matching

_Решения для нового книжно-центричного режима, сосуществующего с текущим сценарным представлением._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 50 FR в шести областях: session lifecycle; персональный книжный каталог; conditional/hard decisions; формирование и назначения; предварительные круги; административное управление и сосуществование режимов. Архитектурно это новая доменная модель, а не UI-проекция текущих сценариев.

**Non-Functional Requirements:** сериализуемые cross-user transitions, единственный слот, идемпотентность, versioned reconciliation, p95 до 1 секунды при 30 участниках/50 книгах, публичные идентификаторы без raw user IDs, audit coverage, клавиатурная и мобильная доступность.

**Scale & Complexity:**

- Primary domain: full-stack collaborative web application.
- Complexity level: high delivery complexity внутри low-volume продукта.
- Estimated architectural components: 12 — schema/migration, transition executor, intent service, assignment/forming service, circle partitioner, book-centric read model, public DTO, participant API, admin API, user tab, admin mode, audit/test/rollout integration.

### Technical Constraints & Dependencies

- Next.js 14 App Router, TypeScript strict, Neon Postgres и Drizzle остаются обязательным стеком.
- Все matching-мутации должны проходить через существующий `runMatchingTransition` и `withAuditContext`.
- Строка сессии уже блокируется `FOR UPDATE`; `state_version` служит optimistic-concurrency контрактом и должен сохраниться.
- Текущие `matching_circle_confirmations` выбирают exact scenario circle, а `matching_locked_circles` смешивают назначение и размещение; они не подходят как canonical storage новой модели.
- Текущий lifecycle `active|frozen` необратим, удаляет confirmations и блокирует admin mutations; новый режим требует `open|closed` и reopening.
- Сценарная вкладка зависит от legacy ranks, confirmations, locked circles и scenario engine. Книжная вкладка требует отдельного read model, но использует общий session shell и version.
- Публичная граница использует `publicRef`/displayName; raw user IDs запрещены в participant DTO.
- Все новые таблицы требуют `AUDITED_TABLES`, DB triggers и semantic `matching_events`.

### Cross-Cutting Concerns Identified

- **Сериализация:** одна пользовательская мутация может изменить intents и assignments нескольких людей и несколько книг.
- **Live shortlist:** каталог должен уважать hard/assignment bindings даже в закрытой сессии.
- **Lifecycle:** close/reopen меняет права, но не удаляет сигналы и назначения.
- **Admin override:** ручное состояние имеет приоритет, но последующее пользовательское изменение в открытой сессии может снова пересобрать круги.
- **Legacy coexistence:** независимые CTA двух вкладок могут создать противоречивые решения одного пользователя.
- **Migration:** преобразование живых confirmations/locked circles семантически неоднозначно; безопасный rollout предпочтителен между сессиями.
- **Observability:** state version, semantic events и audit snapshots должны объяснять автоматическое назначение и ручные переносы.

## Starter Template Evaluation

### Primary Technology Domain

Brownfield full-stack web application на Next.js App Router.

### Starter Options Considered

Новый starter не применяется. Официальный `create-next-app` остаётся текущим способом инициализации новых Next.js приложений, но его запуск создал бы второй проект и нарушил существующие conventions, инфраструктуру, auth, аудит и deploy pipeline.

### Selected Foundation: Existing Repository

- Next.js `14.2.35`, React 18, TypeScript 5 strict.
- Drizzle ORM `^0.45.1` и Neon Postgres.
- NextAuth v5, Tailwind/design tokens, Jest 29, Playwright 1.58.
- Существующие App Router route handlers, Server Components, `components/nd`, audit context и PR-flow.

Новые зависимости не требуются. Drizzle поддерживает транзакции с rollback и PostgreSQL isolation configuration; архитектура использует действующий transaction wrapper и явную row lock вместо внедрения нового data-access framework.

### Architectural Decisions Inherited

- `@/` imports, named exports в `lib`, co-located unit tests.
- Next.js route handlers как HTTP boundary.
- Drizzle schema и SQL migrations как source of truth для БД.
- Vercel deploy через защищённый PR-flow.
- Белая редакторская дизайн-система и существующие Matching primitives.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical decisions:** canonical tables for intent/assignment/circle; one session-level transition executor; `open|closed` lifecycle; interaction contract between scenario and book tabs; additive rollout between sessions.

**Important decisions:** unified versioned DTO; command-oriented routes; deterministic grouping; public identity boundary; audit event taxonomy; close/reopen polling behavior.

**Deferred decisions:** capacity above one; removal of legacy scenario tables; long-term analytics; richer filters; permanent retirement of scenario UX.

### Data Architecture

#### Interest remains derived

Base interest is the intersection of session membership and the current `signup_books` row with eligible personal status. It is not copied into a session table. `book_priorities` remains an input only to the legacy scenario tab.

#### New canonical tables

**`matching_book_intents`**

- `(session_id, user_id, book_id)` primary key.
- `kind: conditional | hard`, timestamps.
- Partial unique `(session_id, user_id) WHERE kind='hard'`.
- Index `(session_id, book_id, kind, created_at)`.
- Composite FK `(session_id,user_id)` to session participant and FK to book.

**`matching_session_book_states`**

- `(session_id, book_id)` primary key.
- `formed_at`, `formed_state_version`.
- Stores the irreversible formation event independently of current assignment count.
- Current viability and number of circles remain derived from assignments.

**`matching_book_assignments`**

- `(session_id, user_id)` primary key, enforcing one slot.
- `book_id`, `source: hard|conditional|admin`, `assigned_at`, `assigned_by`, nullable `circle_id`.
- Index `(session_id, book_id, assigned_at, user_id)`.
- Assignment persists independently of circle viability.

**`matching_circles`**

- UUID `id`, `session_id`, `book_id`, `position`, timestamps.
- Unique `(id, session_id, book_id)` supports a composite FK from assignment, preventing placement into a circle of another book.
- Group size is derived and has no DB constraint; admin may create any size.

All four tables have stable IDs or composite entity identities suitable for audit. Book deletion with active assignment uses `RESTRICT` or an explicit admin cleanup transition; silent cascade is forbidden.

#### Legacy coexistence

`matching_circle_confirmations` and `matching_locked_circles` remain legacy storage for the scenario tab during the experiment. They are not read as canonical book intents or assignments. Destructive removal is deferred until the experiment chooses a primary model.

### Transaction Architecture

Extend `runMatchingTransition`; do not create a second mutation engine.

Every command performs, in one `withAuditContext` transaction:

1. Lock session row `FOR UPDATE`.
2. Validate `expectedStateVersion`.
3. Resolve actor, role, membership and lifecycle permissions.
4. Validate current intent/assignment/shortlist state.
5. Apply requested mutation and all automatic consequences.
6. Recompute affected book assignments/circles.
7. Insert deterministic semantic events.
8. Increment `state_version` exactly once.

The session lock intentionally serializes all mutations within one small club session. DB unique constraints remain the final defense against implementation mistakes and cross-session reopen races.

#### User command semantics

- **Set/unset conditional:** only open session, free participant, no hard/assignment, unformed shortlist book.
- **Set/switch hard:** clear all actor conditionals and prior hard; if book is formed, assign directly; otherwise store hard and evaluate formation.
- **Cancel hard:** allowed only without assignment.
- **Leave:** allowed only without assignment; deletes membership and intents atomically.
- **Shortlist mutation:** conditional is cleared; hard requires explicit cancellation; assignment blocks user mutation.

#### Formation transaction

After hard or relevant catalog change:

1. Count available hard `H` and conditional `C` for the book.
2. If `H≥2 && H+C≥3`, insert the formed marker idempotently.
3. Insert assignments for every available hard and conditional participant.
4. Delete all intents of newly assigned users across the session.
5. Rebuild preliminary circles for the affected book.

Because the session row is locked, the first committed book consumes shared conditional users; later commands recompute against the new state. Assignment PK prevents double placement even if service logic regresses.

#### Circle partitioning

- For `N<3`, automatic placement leaves assignments without a circle.
- For `N≥3`, `k = ceil(N/5)` circles.
- Sort assignments by `assigned_at`, then `user_id` as deterministic tie-breaker.
- Distribute as evenly as possible so sizes differ by at most one.
- A new user-driven assignment rebuilds the book's automatic layout from canonical order.
- An admin move writes explicit `circle_id` without size validation; a later user-driven rebuild may replace it.

### Session Lifecycle

Replace user-facing semantics `active|frozen` with `open|closed`.

- Only one `open` session, enforced by partial unique index.
- Close preserves participants, intents, assignments, circles and event history.
- Closed session rejects participant commands but accepts admin commands.
- Reopen preserves state and re-enables participant commands/automation.
- Concurrent reopening of two sessions maps partial-index violation to `409`.
- `frozen_scenario_json` may remain as a legacy scenario snapshot during migration but is not canonical for book mode.

### Authentication and Security

- Participant commands derive `userId` from `auth()`; user-controlled IDs are ignored.
- Admin commands require server-side `isAdmin` and may target users by internal identifier resolved only inside the privileged route.
- Participant DTOs expose `publicRef` and display name, never raw user IDs.
- Every table is registered in `AUDITED_TABLES`; matching mutation events include actor, subjects, source/destination book and resulting state version.
- No new sensitive columns are introduced; audit masking changes are unnecessary unless private notes or contacts are added later.

### API and Communication Patterns

Use command-oriented HTTP routes backed by one domain executor:

- `GET /api/matching/state` returns shared session metadata, legacy scenario state and `bookMode` read model at one version.
- `POST /api/matching/sessions/[id]/book-actions` accepts a discriminated participant command union: conditional set/unset, hard set/cancel, leave.
- Existing catalog endpoints delegate active binding checks to the same executor whenever the user participates in a current open/closed session.
- `POST /api/matching/sessions/[id]/book-admin-actions` accepts admin assign/unassign/transfer/place/remove-participant commands.
- Session close/reopen remain explicit admin commands in the existing transition route family.

All successful responses return canonical state/version or a version pointer. `409` returns enough canonical state for client reconciliation. No-op and idempotent retry return success without new events/version.

### Read Model and Frontend Architecture

Create one book-centric read model per viewer:

- Participant mode: every current shortlist book, intersection members, status counts, own actions, pinned hard/assignment, preliminary circles visible by policy.
- Admin mode: union of all session shortlist/intent/assignment books and all privileged controls.
- Participant records use explicit `interest|conditional|hard|assigned` status and stable public refs.
- Sorting: own pinned book first, then intersection count with stable book tie-break.

`MatchingRealtimeClient` remains the session shell. It renders a tab switch with legacy `MatchingScenarios` and new `MatchingBooksView`. Initial SSR data and polling refresh use the same DTO; the separate SSR-only `bookParticipants` projection is removed from the new path.

Closed clients continue low-frequency version checks so reopening is discoverable. Pending commands preserve stable card keys and restore focus after reorder.

### Infrastructure and Deployment

- No new service, queue, cache or realtime transport.
- Keep current polling/state-version mechanism for the initial release.
- Additive migration first; legacy tables remain.
- Rollout only when no matching session is open unless an explicit live-data migration is approved.
- Deploy code behind an inaccessible feature gate, then enable the complete book mode in one user-visible release.

### Alternatives Rejected

- **Derive book mode from scenarios:** loses zero-overlap books and durable signals.
- **Reuse exact-circle confirmations:** wrong aggregate and lifecycle.
- **Reuse locked circles as assignments:** conflates book commitment and group placement.
- **Second mutation executor:** risks divergent concurrency/audit rules.
- **Global optimization:** conflicts with event-order and human-override product model.
- **Protected manual grouping mode:** rejected as unnecessary complexity.

### Decision Impact Analysis

**Implementation sequence:** additive schema and audit triggers → executor commands and pure partitioner → book read model/DTO → participant routes/UI → admin commands/UI → lifecycle migration → regression, concurrency and E2E coverage → gated enablement.

**Cross-component dependencies:** catalog mutation guards depend on assignments; UI actions depend on versioned DTO; close/reopen depends on polling continuing after close; scenario coexistence depends on a single authoritative participant choice policy.

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database:** Drizzle variables camelCase, SQL tables/columns snake_case. New names use `matchingBookIntents` → `matching_book_intents`, `sessionId` → `session_id`. Indexes use `table_columns_purpose_idx`; partial uniques end `_uniq`.

**Domain commands:** discriminated union with camelCase command types: `setConditional`, `unsetConditional`, `setHard`, `cancelHard`, `adminTransferBook`, `closeSession`, `reopenSession`.

**Semantic events:** past-tense snake_case: `conditional_set`, `hard_switched`, `book_formed`, `participant_auto_assigned`, `admin_book_transferred`, `circles_rebalanced`, `session_closed`, `session_reopened`.

**Components:** PascalCase files under `components/nd/`: `MatchingBooksView.tsx`, `MatchingBookCard.tsx`, `MatchingBookParticipants.tsx`, `MatchingBookAdminControls.tsx`.

### Structure Patterns

- Pure state/partition functions live in `lib/matching/book-mode.ts` or a `lib/matching/book-mode/` feature folder if split.
- Transactional orchestration extends `lib/matching/session-transition.ts` and its DB adapter; routes never reproduce domain rules.
- Public read-model assembly lives beside existing `public-state*` modules and exposes one canonical type.
- Route tests remain co-located as `route.test.ts`; pure utility tests remain beside source.
- New E2E flows use shared fixtures and teardown in `e2e/fixtures.ts`.

### API and Data Formats

- JSON uses camelCase and ISO 8601 strings.
- Successful mutation: `{ stateVersion, state? }` or `{ stateVersion, changed: false }` for no-op.
- Conflict: HTTP `409` with `{ error, code: 'STALE_STATE', stateVersion, state }`.
- Validation/auth errors use stable `code` plus user-safe `error`; internal details remain server logs.
- Public participant objects contain `publicRef`, `displayName`, `status`; raw user IDs never cross the participant boundary.

### State and Communication Patterns

- `expectedStateVersion` is mandatory on every book-mode and lifecycle mutation.
- Server response is canonical; client pending state is temporary and reconciles by version.
- Polling compares versions, fetches one full DTO, then replaces local state immutably.
- Cards use stable `bookId` keys; participant chips use stable `publicRef` keys.
- Close does not stop polling permanently; closed clients must discover reopening.

### Transaction and Event Patterns

- Exactly one `runMatchingTransition` call per HTTP mutation.
- Exactly one session row lock and one version increment per logical command.
- Automatic assignments and all cleared intents are part of the initiating command, not follow-up requests.
- Every mutated domain entity is auditable in the same transaction.
- One high-level event may contain multiple affected subjects; event ordering is deterministic within a state version.
- No-op retry produces no additional semantic event.

### Error and Loading Patterns

- Domain services return typed results/errors; route handlers map them to HTTP.
- User actions show local pending state keyed by command/book and disable only conflicting controls.
- Destructive admin actions require clear intent in the control, but size 3–5 never blocks the command.
- `409` triggers immediate state replacement and a concise retry message; it is not surfaced as an unrecoverable error.
- Focus returns to the initiating control or pinned card after server-driven reorder.

### Enforcement Guidelines

All agents must:

- use the existing transition executor and audit context;
- preserve public identity boundaries;
- add migration contract, unit, route and E2E coverage for every new transition;
- update `AUDITED_TABLES`, triggers, `public/openapi.json`, feature docs and Wiki;
- avoid direct writes to intents/assignments/circles outside the executor;
- avoid deriving book state from scenario cards or confirmation snapshots.

### Anti-Patterns

- Route handler writes one table and invokes a second HTTP endpoint for reconciliation.
- UI accepts `userId` from public state or sends it for participant actions.
- Hard choice and conditional cleanup occur in separate transactions.
- Assignment existence is inferred from circle membership.
- Closed session disables polling forever.
- Admin move is rejected because a circle becomes smaller than three or larger than five.

## Project Structure & Boundaries

### Feature Directory Structure

```text
app/
├── matching/page.tsx                              # SSR auth/session bootstrap
└── api/matching/
    ├── state/route.ts                             # shared versioned DTO
    └── sessions/[id]/
        ├── book-actions/route.ts                  # participant command union
        ├── book-actions/route.test.ts
        ├── book-admin-actions/route.ts            # privileged command union
        ├── book-admin-actions/route.test.ts
        ├── close/route.ts                         # lifecycle command
        ├── close/route.test.ts
        ├── reopen/route.ts
        └── reopen/route.test.ts

components/nd/
├── MatchingRealtimeClient.tsx                     # common shell + tabs
├── MatchingModeTabs.tsx
├── MatchingBooksView.tsx
├── MatchingBookCard.tsx
├── MatchingBookParticipants.tsx
├── MatchingBookCircles.tsx
├── MatchingBookAdminControls.tsx
└── *.test.tsx                                     # co-located component tests

lib/matching/
├── session-transition.ts                          # command policy/orchestration
├── session-transition-db.ts                       # transaction + shared DB port
├── book-mode-types.ts                             # domain/read-model types
├── book-mode-partition.ts                         # pure 3–5 partitioner
├── book-mode-transition-db.ts                     # DB operations using caller tx
├── book-mode-read-model.ts                        # pure DTO builder
├── book-mode-read-model-db.ts                     # query loader
├── public-state.ts                                # shared state composition
├── public-state-db.ts
└── __tests__/
    ├── book-mode-partition.test.ts
    ├── book-mode-transition.test.ts
    ├── book-mode-read-model.test.ts
    └── session-transition*.test.ts

lib/
├── db/schema.ts                                   # four new tables + relations
└── audit/audited-tables.ts                        # audited registry

drizzle/
├── 005x_matching_book_mode.sql                    # next available migration
└── 005x_matching_book_mode.test.ts                # schema/constraint/trigger contract

e2e/
├── fixtures.ts                                    # new matching book-mode helpers
├── matching-books.spec.ts
├── matching-admin.spec.ts                         # extend admin transitions
├── matching-realtime.spec.ts                      # extend version propagation
├── matching-audit.spec.ts                         # extend semantic/audit events
└── ui-states.spec.ts                              # responsive/layout states

docs/
├── features/matching.md
├── features/testing.md
├── wiki/Group-Matching-Mode.md
├── wiki/Data-and-Database.md
├── wiki/API-and-Swagger.md
├── wiki/Admin-Panel.md
├── wiki/Privacy-and-User-Data.md
└── planning-artifacts/
    ├── prd-matching-books.md
    └── architecture-matching-books.md

public/openapi.json
```

### Architectural Boundaries

**HTTP boundary:** route handlers authenticate, parse a discriminated command, call one transition function and map typed results to HTTP. They contain no formation, clearing or grouping logic.

**Domain boundary:** `session-transition.ts` owns permission and state-transition rules. Pure partition/read-model helpers contain deterministic computation. `book-mode-transition-db.ts` receives the caller transaction and never begins or commits its own transaction.

**Data boundary:** only the executor and read-model DB loader access new tables. UI and routes do not import Drizzle schema directly.

**Frontend boundary:** `MatchingRealtimeClient` owns canonical state/version and tab selection. Book components receive DTOs and emit commands; they do not infer assignments from visible circles.

**Identity boundary:** public DTOs map internal user IDs to `publicRef`. Admin routes may resolve privileged targets server-side, but participant components never receive internal IDs.

### Requirements to Structure Mapping

- **FR1–FR8 Session lifecycle:** `session-transition*`, close/reopen routes, `MatchingHeader`, polling shell.
- **FR9–FR16 Personal catalog:** book-mode read model, `MatchingBooksView`, catalog mutation integration.
- **FR17–FR30 Decisions/forming:** command route, transition service, intents/states/assignments tables.
- **FR31–FR36 Circles:** partitioner, circles/assignment storage, `MatchingBookCircles`.
- **FR37–FR44 Admin:** admin command route and `MatchingBookAdminControls`.
- **FR45–FR50 Coexistence/public state:** `MatchingModeTabs`, `public-state*`, `MatchingRealtimeClient`.

### Data Flow

```text
User/Admin action
  → route auth + command validation
  → runMatchingTransition
  → withAuditContext transaction
  → session FOR UPDATE + expected version
  → intent/assignment/lifecycle mutation
  → formation + circle reconciliation
  → semantic events + audit triggers
  → single state_version increment
  → canonical version/state response
  → MatchingRealtimeClient replacement
  → both tabs render the same version
```

### External Integrations

No new external integration. Neon stores state, NextAuth provides actor/role, Vercel hosts routes, and the existing polling mechanism propagates changes. Chat remains outside the product boundary.

### Development and Deployment Boundaries

- Feature implementation may land internally behind a closed gate, but user enablement is atomic.
- Migration application follows `db-migrate` and occurs before feature enablement.
- Legacy schema is removed only after the experiment and a separate destructive migration.
- Merge requires existing CI plus local matching E2E/UI layout runs because nightly E2E is not a merge gate.

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** existing Next.js/Drizzle/Auth/audit stack supports the design. Session-row serialization, assignment uniqueness and version reconciliation reinforce one another. Book assignment and circle placement are consistently separated across schema, commands, DTO and UI.

**Pattern Consistency:** one executor, command naming, event naming, public identity and error contracts are defined. No route or component requires independent business rules.

**Structure Alignment:** proposed files extend existing `lib/matching`, route and `components/nd` conventions. No parallel service layer or new runtime is introduced.

### Requirements Coverage Validation

**Functional Requirements:** all FR1–FR50 map to session transitions, book read model, participant/admin commands, tab shell or public DTO.

**Non-Functional Requirements:** session lock and unique constraints cover consistency; direct book aggregates avoid scenario-engine performance; public refs/auth guards cover privacy; audit tables/events cover operability; component patterns cover accessibility and responsive behavior.

### Implementation Readiness Validation

**Decision completeness:** storage, transitions, grouping, lifecycle, API, frontend state, audit and rollout decisions are documented.

**Structure completeness:** implementation locations and boundaries are concrete; tests and docs are mapped.

**Pattern completeness:** concurrency, idempotency, event versioning, DTO identity, error recovery and focus/reorder behavior are specified.

### Gap Analysis Results

**Blocking product decisions:**

1. Scenario tab interaction policy while book mode is active.
2. Whether a book remains historically formed after admin removes assignments below three.
3. Which closed session is considered current and how old assignments interact with the global shortlist after a new session opens.

**Important decisions:**

4. Whether admin may assign outside shortlist without altering that shortlist.
5. Whether every participant sees all preliminary circles for their books or only their own circle plus aggregate status.
6. Migration policy for any session active at rollout.

### Provisional Assumptions Used for Design

- Scenario tab is read-only during the experiment unless its CTA is rewritten to emit the same hard book intent.
- `formed_at` persists after admin destruction; current viability is displayed separately. Resetting formation is outside MVP.
- Only the current session constrains live shortlist mutation; historical closed assignments remain visible from session history but do not lock future catalog editing after a new session becomes current.
- Admin assignment outside shortlist does not mutate the global shortlist; assigned book is injected and pinned in the participant's session view.
- Participants see preliminary circles for books in their personal Matching catalog; admin sees all circles.
- Production rollout occurs between sessions; live legacy state is not auto-converted.

### Architecture Completeness Checklist

- [x] Project context and existing Matching audited.
- [x] 50 FR and all NFR categories mapped.
- [x] Canonical storage and constraints defined.
- [x] Transaction boundaries and concurrency strategy defined.
- [x] Participant/admin API and UI boundaries defined.
- [x] Audit, migration, testing and rollout requirements defined.
- [x] Legacy coexistence risks identified.
- [ ] Product owner confirms the six decisions above.

### Architecture Readiness Assessment

**Overall Status:** CONDITIONALLY READY FOR IMPLEMENTATION

**Confidence:** high for storage and transactional design; medium for coexistence/lifecycle behavior until product questions are answered.

**Key strengths:** reuses proven transaction/audit choke-point; DB-enforced single assignment; additive rollout; explicit separation between commitment and grouping; deterministic automatic behavior with unrestricted admin override.

### Implementation Handoff

First implementation priority is the additive schema plus migration contract and pure state-transition/partition tests. User-visible work should remain gated until product decisions are resolved and the entire vertical slice passes E2E.

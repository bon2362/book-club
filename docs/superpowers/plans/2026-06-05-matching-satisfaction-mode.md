# Matching Satisfaction Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in per-session matching mode `satisfaction` that ranks scenarios by group-interest quality first (coverage second), gated behind a ranking step, alongside the unchanged default `coverage` mode.

**Architecture:** A new `optimization_mode` column on `matching_sessions` selects, per session, which comparator the scenario engine uses. The coverage path is untouched; all new behaviour lives behind `mode === 'satisfaction'`. A new lexicographic-by-group comparator replaces only the *comparison functions* inside the existing beam search. A ranking gate (new intermediate screen) plus input filtering ensure satisfaction sessions only consider ranked signups. Moves and four UI surfaces branch on mode.

**Tech Stack:** Next.js 14 (App Router, server components), TypeScript, Drizzle ORM (Neon Postgres), Jest (unit), Playwright (e2e), dnd-kit, design tokens in `app/globals.css`.

**Source documents:**
- Feature spec: `docs/superpowers/specs/2026-06-05-matching-satisfaction-mode-design.md`
- UI concept (high-fidelity, exact copy/tokens): `docs/superpowers/specs/satisfaction/README.md` + design references `AdminMode.jsx`, `RankingGate.jsx`, `Scenarios.jsx`, `Adrift.jsx`, `shared.jsx`.

**Conventions for every task:**
- Branch already exists (worktree). Commit after each task. Never push to `main` directly; integration is via PR at the end (see CLAUDE.md PR-flow).
- Before each commit run: `npm run lint && npm run typecheck && npm test`. UI/CSS tasks additionally run the relevant Playwright spec.
- Design system is law: only `var(--…)` tokens, no raw hex, `border-radius: var(--radius)` (0) except where a token says otherwise, no `box-shadow` literals beyond existing patterns, no dark theme. Circles only for avatars.
- `npm test` from inside `.claude/worktrees/...` finds 0 tests (Jest ignores worktree paths — see MEMORY.md). Run unit tests from the main checkout `/Users/ekoshkin/book-club`, or rely on CI. Verify locally where possible.

---

## File Structure

**Created:**
- `drizzle/0038_matching_optimization_mode.sql` — adds `optimization_mode` column.
- `components/nd/MatchingRankingGate.tsx` — intermediate ranking screen (satisfaction gate).
- `e2e/matching-satisfaction.spec.ts` — end-to-end flow for satisfaction sessions.

**Modified:**
- `lib/db/schema.ts` — `optimizationMode` column on `matchingSessions`.
- `lib/matching/scenarios.ts` — `mode` on input/overview types; satisfaction comparators; mode-aware selection; tiers; `filterSignupsByMode` helper.
- `lib/matching/scenario-input.ts` — read `optimizationMode`; filter unranked signups in satisfaction; pass `mode`.
- `app/matching/page.tsx` — same filtering + `mode`; render `MatchingRankingGate` when gated.
- `app/api/matching/state/route.ts` — same filtering + `mode` threaded into engine + moves.
- `app/api/matching/sessions/route.ts` — accept/validate/persist `optimizationMode`.
- `components/nd/AdminMatchingSession.tsx` — «Режим подбора» selector in create form.
- `lib/matching/move-impact.ts` — `mode` param; satisfaction meaningfulness + sort.
- `lib/matching/my-moves.ts` — pass viewer rank context for satisfaction (already has ranks).
- `components/nd/MatchingPersonalList.tsx` — optional `suppressRefresh` + `onChange(rankedCount)` for gate reuse.
- `components/nd/MatchingImpactWorkspace.tsx` — read `overview.mode`, pass down.
- `components/nd/MatchingScenarios.tsx` — neutral satisfaction copy/labels.
- `components/nd/MatchingMyMoves.tsx` — satisfaction copy.
- `components/nd/MatchingAdriftBanner.tsx` — `mode`/`variant` softened copy.

**Tests touched:**
- `lib/matching/__tests__/scenarios.test.ts`
- `lib/matching/__tests__/move-impact.test.ts` (create if absent; check first)
- `app/api/matching/sessions/route.test.ts`
- `e2e/matching-satisfaction.spec.ts`

---

## Phase 1 — Engine types & comparators

### Task 1: Add `mode` to engine types (no behaviour change)

**Files:**
- Modify: `lib/matching/scenarios.ts`
- Test: `lib/matching/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `lib/matching/__tests__/scenarios.test.ts`:

```ts
describe('mode field', () => {
  it('defaults overview.mode to coverage when no mode given', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(['u1', 'u2', 'u3'], 'b1'),
      ranks: rankAll(['u1', 'u2', 'u3'], 'b1', 1),
      minGroupSize: 3, maxGroupSize: 3,
    })
    expect(result.mode).toBe('coverage')
  })
})
```

- [ ] **Step 2: Run test, expect fail**

Run (from main checkout): `npx jest lib/matching/__tests__/scenarios.test.ts -t "defaults overview.mode"`
Expected: FAIL — `result.mode` is `undefined`.

- [ ] **Step 3: Implement type + plumbing**

In `lib/matching/scenarios.ts`:

1. Add a mode type near the top:
```ts
export type OptimizationMode = 'coverage' | 'satisfaction'
```

2. Add `mode` to `GenerateScenariosInput`:
```ts
export interface GenerateScenariosInput {
  participants: ScenarioParticipant[]
  books: ScenarioBook[]
  signups: ScenarioSignup[]
  ranks: ScenarioRank[]
  minGroupSize: number
  maxGroupSize: number
  maxResults?: number
  mode?: OptimizationMode
}
```

3. Add `mode` to both overview interfaces:
```ts
export interface ScenarioOverview {
  // ...existing fields...
  mode: OptimizationMode
}
export interface ScenarioSetOverview {
  // ...existing fields...
  mode: OptimizationMode
}
```

4. Update `emptyScenarioSetOverview` and `emptyScenarioOverview` to accept and set mode (default `'coverage'`):
```ts
export function emptyScenarioSetOverview(
  participants: ScenarioParticipant[],
  minGroupSize: number,
  maxGroupSize = minGroupSize,
  mode: OptimizationMode = 'coverage',
): ScenarioSetOverview {
  return { scenarios: [], leader: null, totalCount: participants.length, minGroupSize, maxGroupSize, mode }
}
```
```ts
export function emptyScenarioOverview(
  participants: ScenarioParticipant[],
  minGroupSize: number,
  maxGroupSize = minGroupSize,
  mode: OptimizationMode = 'coverage',
): ScenarioOverview {
  return { current: [], candidates: [], leftOut: participants, coveredCount: 0, totalCount: participants.length, minGroupSize, maxGroupSize, mode }
}
```

5. In `generateScenarioSets`, read `const mode = input.mode ?? 'coverage'` and include `mode` in the returned object and in its `emptyScenarioSetOverview(...)` early-returns (pass `mode` as 4th arg).

6. In `generateScenarioOverview`, thread `mode` similarly: pass `input.mode` to `emptyScenarioOverview` early-returns and set `mode` on the returned object.

- [ ] **Step 4: Run test, expect pass**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts`
Expected: PASS (all existing tests still green — `mode` is additive/optional).

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: errors in callers that construct `ScenarioSetOverview`/`ScenarioOverview` literals without `mode`. Fix each by adding `mode: 'coverage'` (or threading the real mode in later tasks). Known callers: `app/api/matching/state/route.ts` (uses `emptyScenarioOverview`/`emptyScenarioSetOverview` — already covered by new default param, no change needed), `lib/matching/public-state.ts` (spreads `...overview`, so `mode` is preserved — no change). If typecheck flags a literal, add `mode: 'coverage'`.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/scenarios.ts lib/matching/__tests__/scenarios.test.ts
git commit -m "feat(matching): add optimization mode field to scenario engine types"
```

---

### Task 2: Satisfaction circle & scenario comparators (pure functions)

**Files:**
- Modify: `lib/matching/scenarios.ts`
- Test: `lib/matching/__tests__/scenarios.test.ts`

Background: existing `compareCircleScore(a,b)` returns positive when `a` is better (coverage flavour: `wantsCount → avgRank → worstRank → unrankedCount → id`). `compareScenarioScore` is coverage-first. We add satisfaction variants next to them and export them for direct unit testing.

- [ ] **Step 1: Write failing tests**

Append to `scenarios.test.ts`:

```ts
import {
  compareCircleSatisfaction,
  compareScenarioSatisfaction,
} from '../scenarios'

function circle(id: string, ranks: number[]): import('../scenarios').MatchingCircle {
  const members = ranks.map((rank, i) => ({
    userId: `${id}-u${i}`, pseudonym: `${id}-p${i}`, rank,
    interest: (rank <= 3 ? 'очень хочу' : 'хочу') as 'очень хочу' | 'хочу',
  }))
  const ranked = members.filter((m) => m.rank !== null)
  return {
    id, bookId: id.split(':')[0], members, minSize: 3, maxSize: 4,
    wantsCount: ranked.filter((m) => m.rank! <= 3).length,
    avgRank: ranked.reduce((s, m) => s + m.rank!, 0) / ranked.length,
    worstRank: Math.max(...ranked.map((m) => m.rank!)),
    unrankedCount: members.length - ranked.length,
  }
}

function scenario(id: string, circles: import('../scenarios').MatchingCircle[]): Pick<import('../scenarios').MatchingScenario, 'id' | 'circles' | 'score'> {
  const members = circles.flatMap((c) => c.members)
  const ranked = members.filter((m) => m.rank !== null)
  const rankSum = ranked.reduce((s, m) => s + m.rank!, 0)
  return {
    id, circles,
    score: {
      coveredCount: new Set(members.map((m) => m.userId)).size,
      totalCount: 9,
      coverageRatio: 0,
      strongInterestCount: ranked.filter((m) => m.rank! <= 3).length,
      rankedCount: ranked.length,
      unrankedCount: 0,
      rankSum,
      avgRank: rankSum / ranked.length,
      worstRank: Math.max(...ranked.map((m) => m.rank!)),
    },
  }
}

describe('compareCircleSatisfaction', () => {
  it('prefers lower average rank ((1,1,6) over (3,3,3))', () => {
    expect(compareCircleSatisfaction(circle('a:1', [1, 1, 6]), circle('b:1', [3, 3, 3]))).toBeGreaterThan(0)
  })
  it('breaks avg ties by worst rank', () => {
    // both avg 2.0 → (2,2,2) worst 2 beats (1,1,4) worst 4
    expect(compareCircleSatisfaction(circle('a:1', [2, 2, 2]), circle('b:1', [1, 1, 4]))).toBeGreaterThan(0)
  })
  it('prefers larger circle when avg and worst tie', () => {
    expect(compareCircleSatisfaction(circle('a:1', [2, 2, 2, 2]), circle('b:1', [2, 2, 2]))).toBeGreaterThan(0)
  })
})

describe('compareScenarioSatisfaction', () => {
  it('6 covered with better books beats 9 covered with worse books', () => {
    const a = scenario('a', [circle('x:1', [1, 1, 1]), circle('y:1', [2, 2, 2])])
    const b = scenario('b', [circle('x:1', [1, 1, 1]), circle('y:1', [3, 3, 3]), circle('z:1', [4, 4, 4])])
    expect(compareScenarioSatisfaction(a, b)).toBeGreaterThan(0)
  })
  it('extra group beats nothing when prefixes tie', () => {
    const a = scenario('a', [circle('x:1', [1, 1, 1])])
    const b = scenario('b', [circle('x:1', [1, 1, 1]), circle('y:1', [2, 2, 2]), circle('z:1', [2, 2, 2])])
    expect(compareScenarioSatisfaction(a, b)).toBeLessThan(0)
  })
  it('satisfaction strictly first: perfect trio beats two good trios', () => {
    const a = scenario('a', [circle('x:1', [1, 1, 1])])
    const b = scenario('b', [circle('y:1', [2, 2, 2]), circle('z:1', [2, 2, 2])])
    expect(compareScenarioSatisfaction(a, b)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests, expect fail**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts -t "Satisfaction"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the comparators**

Add to `lib/matching/scenarios.ts` (near `compareCircleScore`):

```ts
// Positive means a is better than b (satisfaction flavour).
export function compareCircleSatisfaction(a: MatchingCircle, b: MatchingCircle): number {
  const avg = compareNullableRankAsc(a.avgRank, b.avgRank)
  if (avg !== 0) return -avg
  const worst = compareNullableRankAsc(a.worstRank, b.worstRank)
  if (worst !== 0) return -worst
  if (a.members.length !== b.members.length) return a.members.length - b.members.length
  return b.id.localeCompare(a.id)
}

// Positive means a is better than b (satisfaction flavour):
// lexicographic over circles sorted best-first; an extra circle beats nothing.
export function compareScenarioSatisfaction(
  a: Pick<MatchingScenario, 'id' | 'circles' | 'score'>,
  b: Pick<MatchingScenario, 'id' | 'circles' | 'score'>,
): number {
  const as = [...a.circles].sort((x, y) => compareCircleSatisfaction(y, x))
  const bs = [...b.circles].sort((x, y) => compareCircleSatisfaction(y, x))
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const ca = as[i]
    const cb = bs[i]
    if (ca && cb) {
      const c = compareCircleSatisfaction(ca, cb)
      if (c !== 0) return c
    } else if (ca && !cb) {
      return 1
    } else if (!ca && cb) {
      return -1
    }
  }
  // Fully equal circle-quality vectors → stable list order.
  const avg = compareNullableRankAsc(a.score.avgRank, b.score.avgRank)
  if (avg !== 0) return -avg
  if (a.score.strongInterestCount !== b.score.strongInterestCount) {
    return a.score.strongInterestCount - b.score.strongInterestCount
  }
  return b.id.localeCompare(a.id)
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/scenarios.ts lib/matching/__tests__/scenarios.test.ts
git commit -m "feat(matching): add satisfaction circle and scenario comparators"
```

---

### Task 3: Wire comparator selection by mode into the beam search

**Files:**
- Modify: `lib/matching/scenarios.ts`
- Test: `lib/matching/__tests__/scenarios.test.ts`

The functions that currently hardcode coverage comparison: `compareCircleScore` usage in `selectDiverseCircles` and `buildCandidateCircles` final sort; `compareScenarioScore` usage in `compareStates`/`buildScenarioStates`, the final `.sort()` in `generateScenarioSets`, and `assignScenarioTiers`. Introduce mode-aware selector helpers and thread `mode` through these internal functions.

- [ ] **Step 1: Write failing end-to-end satisfaction test**

Append to `scenarios.test.ts`:

```ts
describe('generateScenarioSets satisfaction mode', () => {
  it('prefers a smaller, higher-quality layout over fuller, worse one', () => {
    // 6 participants. b1: u1,u2,u3 all rank 1. b2: u4,u5,u6 all rank 1.
    // b3: all six rank 4 (a worse full-coverage-ish alternative on one book is impossible at size 3+3,
    // so we test that the two rank-1 circles form the leader, not a rank-4 mixing).
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      mode: 'satisfaction',
      participants,
      books: [makeBook('b1'), makeBook('b2'), makeBook('b3')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u4', 'u5', 'u6'], 'b2'),
        ...allSignedUp(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], 'b3'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 1),
        ...rankAll(['u4', 'u5', 'u6'], 'b2', 1),
        ...rankAll(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], 'b3', 4),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })
    expect(result.mode).toBe('satisfaction')
    // Leader = two rank-1 circles (b1 + b2), avg 1.0, covers all 6.
    expect(result.leader?.score.coveredCount).toBe(6)
    expect(result.leader?.score.avgRank).toBe(1)
    expect(result.leader?.circles.map((c) => c.bookId).sort()).toEqual(['b1', 'b2'])
  })

  it('keeps the perfect trio as leader even if a fuller layout exists at worse quality', () => {
    // 4 participants. b1: u1,u2,u3 rank 1. b2: u2,u3,u4 rank 5.
    // Satisfaction leader should be the rank-1 trio (covers 3), not the rank-5 trio.
    const participants = makeParticipants(4)
    const result = generateScenarioSets({
      mode: 'satisfaction',
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u2', 'u3', 'u4'], 'b2'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 1),
        ...rankAll(['u2', 'u3', 'u4'], 'b2', 5),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })
    expect(result.leader?.circles).toHaveLength(1)
    expect(result.leader?.circles[0].bookId).toBe('b1')
    expect(result.leader?.score.avgRank).toBe(1)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts -t "satisfaction mode"`
Expected: FAIL — engine still uses coverage comparison, leader differs (likely picks the fuller/coverage-first layout).

- [ ] **Step 3: Thread mode through internal functions**

In `lib/matching/scenarios.ts`:

1. Add comparator selectors:
```ts
function circleComparator(mode: OptimizationMode) {
  return mode === 'satisfaction' ? compareCircleSatisfaction : compareCircleScore
}
function scenarioComparator(mode: OptimizationMode) {
  return mode === 'satisfaction' ? compareScenarioSatisfaction : compareScenarioScore
}
```

2. `selectDiverseCircles(circles, maxGroupSize)` → add `mode: OptimizationMode` param; replace both `compareCircleScore(b, a)`/`compareCircleScore(a, b)` sorts with `circleComparator(mode)`.

3. `buildCandidateCircles(input)` → read `const mode = input.mode ?? 'coverage'`; pass `mode` to `selectDiverseCircles(circles, maxGroupSize, mode)`; replace the final `.sort((a, b) => compareCircleScore(b, a))` with `circleComparator(mode)`.

4. `compareStates(a, b, totalCount)` → add `mode` param; use `scenarioComparator(mode)(aScenario, bScenario)`.

5. `buildScenarioStates(circles, participants)` → add `mode` param; pass to `compareStates(b, a, participants.length, mode)`.

6. `generateScenarioSets` → pass `mode` into `buildCandidateCircles` (already via `input`), `buildScenarioStates(candidateCircles, participants, mode)`, and replace final `.sort((a, b) => compareScenarioScore(b, a))` with `scenarioComparator(mode)(b, a)`.

7. `assignScenarioTiers(scenarios, totalCount)` → add `mode` param. For satisfaction, skip coverage bands:
```ts
function assignScenarioTiers(scenarios: MatchingScenario[], totalCount: number, mode: OptimizationMode): MatchingScenario[] {
  if (scenarios.length === 0) return []
  if (mode === 'satisfaction') {
    return scenarios.map((scenario, index) => ({ ...scenario, tier: index === 0 ? 'leader' : 'partial' }))
  }
  // ...existing coverage tiering unchanged...
}
```
Update the call site: `assignScenarioTiers(scenarios, participants.length, mode)`.

8. `generateScenarioOverview(input)` → read `mode`; pass to `buildCandidateCircles` (via input) — the candidate listing for the overview should also use mode. No further leader logic change needed (it reads `scenarioSets.leader`).

- [ ] **Step 4: Run all engine tests**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts`
Expected: PASS — new satisfaction tests pass; all coverage tests still green (coverage path uses the same comparators as before via `circleComparator('coverage')` = `compareCircleScore`).

- [ ] **Step 5: lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/scenarios.ts lib/matching/__tests__/scenarios.test.ts
git commit -m "feat(matching): select scenario comparator by optimization mode"
```

---

### Task 4: `filterSignupsByMode` gate helper (pure, reused by all input builders)

**Files:**
- Modify: `lib/matching/scenarios.ts`
- Test: `lib/matching/__tests__/scenarios.test.ts`

In satisfaction mode, a signup only participates if a rank exists for that `(user, book)`. This is the gate. Implement as a pure helper so all three input builders share it and it is unit-tested once.

- [ ] **Step 1: Write failing test**

Append to `scenarios.test.ts`:

```ts
import { filterSignupsByMode } from '../scenarios'

describe('filterSignupsByMode', () => {
  const signups = [
    { userId: 'u1', bookId: 'b1' },
    { userId: 'u1', bookId: 'b2' },
    { userId: 'u2', bookId: 'b1' },
  ]
  const ranks = [
    { userId: 'u1', bookId: 'b1', rank: 1 },
    { userId: 'u1', bookId: 'b2', rank: null },
    { userId: 'u2', bookId: 'b1', rank: 2 },
  ]
  it('keeps all signups in coverage mode', () => {
    expect(filterSignupsByMode(signups, ranks, 'coverage')).toHaveLength(3)
  })
  it('drops signups without a rank in satisfaction mode', () => {
    const result = filterSignupsByMode(signups, ranks, 'satisfaction')
    expect(result).toEqual([
      { userId: 'u1', bookId: 'b1' },
      { userId: 'u2', bookId: 'b1' },
    ])
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts -t "filterSignupsByMode"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Add to `lib/matching/scenarios.ts`:

```ts
export function filterSignupsByMode(
  signups: ScenarioSignup[],
  ranks: ScenarioRank[],
  mode: OptimizationMode,
): ScenarioSignup[] {
  if (mode !== 'satisfaction') return signups
  const ranked = new Set(
    ranks.filter((r) => r.rank !== null).map((r) => `${r.userId}:${r.bookId}`),
  )
  return signups.filter((s) => ranked.has(`${s.userId}:${s.bookId}`))
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest lib/matching/__tests__/scenarios.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/matching/scenarios.ts lib/matching/__tests__/scenarios.test.ts
git commit -m "feat(matching): add filterSignupsByMode gate helper"
```

---

## Phase 2 — Schema & session creation

### Task 5: Database column `optimization_mode`

**Files:**
- Create: `drizzle/0038_matching_optimization_mode.sql`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add the column to schema**

In `lib/db/schema.ts`, inside `matchingSessions` (after `maxGroupSize`):

```ts
  optimizationMode:   text('optimization_mode').notNull().default('coverage'), // 'coverage' | 'satisfaction'
```

- [ ] **Step 2: Create the migration SQL**

Create `drizzle/0038_matching_optimization_mode.sql` (match the style of `drizzle/0037_matching_session_state_version.sql`):

```sql
ALTER TABLE "matching_sessions" ADD COLUMN "optimization_mode" text DEFAULT 'coverage' NOT NULL;
```

- [ ] **Step 3: Apply the migration**

Apply via the same mechanism used for `0037` (the repo applies hand-written SQL against Neon; confirm by checking how prior migrations were run — e.g. a `drizzle-kit migrate`/`psql` step in deploy or a `scripts/` runner). Locally, run the SQL against the dev database. Confirm the column exists:

Run: `npm run typecheck`
Expected: clean (schema type now includes `optimizationMode`).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/0038_matching_optimization_mode.sql
git commit -m "feat(matching): add optimization_mode column to matching_sessions"
```

---

### Task 6: Session-create API accepts `optimizationMode`

**Files:**
- Modify: `app/api/matching/sessions/route.ts`
- Test: `app/api/matching/sessions/route.test.ts`

- [ ] **Step 1: Write failing test**

Open `app/api/matching/sessions/route.test.ts`, find the existing "creates a session" success test, and add a sibling test asserting `optimizationMode` is persisted. Mirror the existing test's mocking style. Add:

```ts
it('persists optimizationMode=satisfaction when provided', async () => {
  // ...arrange admin auth + no active session, as existing success test does...
  const req = makeRequest({ name: 'S', minGroupSize: 3, maxGroupSize: 3, optimizationMode: 'satisfaction' })
  const res = await POST(req)
  expect(res.status).toBe(201)
  // Assert the insert .values() received optimizationMode: 'satisfaction'
  // (match how this suite asserts inserted values — e.g. via the mocked db.insert spy).
})

it('rejects an invalid optimizationMode', async () => {
  const req = makeRequest({ name: 'S', optimizationMode: 'bogus' })
  const res = await POST(req)
  expect(res.status).toBe(400)
})
```

(Use the suite's existing helpers/mocks — read the file first to match `makeRequest` and the db mock shape exactly.)

- [ ] **Step 2: Run, expect fail**

Run: `npx jest app/api/matching/sessions/route.test.ts`
Expected: FAIL — value not persisted / not validated.

- [ ] **Step 3: Implement**

In `app/api/matching/sessions/route.ts`:

1. Extend `CreateSessionBody`:
```ts
interface CreateSessionBody {
  name: string
  minGroupSize?: number
  maxGroupSize?: number
  deadlineAt?: string | null
  optimizationMode?: string
}
```

2. After parsing `groupSizeRange`, validate the mode:
```ts
const optimizationMode = body.optimizationMode ?? 'coverage'
if (optimizationMode !== 'coverage' && optimizationMode !== 'satisfaction') {
  return NextResponse.json({ error: "optimizationMode must be 'coverage' or 'satisfaction'" }, { status: 400 })
}
```

3. Add `optimizationMode` to the `.values({...})` of the insert.

- [ ] **Step 4: Run, expect pass**

Run: `npx jest app/api/matching/sessions/route.test.ts`
Expected: PASS.

- [ ] **Step 5: lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/matching/sessions/route.ts app/api/matching/sessions/route.test.ts
git commit -m "feat(matching): accept and validate optimizationMode on session create"
```

---

### Task 7: «Режим подбора» selector in the create form

**Files:**
- Modify: `components/nd/AdminMatchingSession.tsx`

Reference for exact markup/copy/tokens: `docs/superpowers/specs/satisfaction/AdminMode.jsx` and `README.md` §"1. Селектор режима". Port faithfully into the real form (monospace register, square radio indicator, bottom-strong border on the radiogroup).

- [ ] **Step 1: Add form state**

In `AdminMatchingSession`, with the other form state:
```ts
const [optimizationMode, setOptimizationMode] = useState<'coverage' | 'satisfaction'>('coverage')
```
Reset it in `handleCreate` success branch alongside the others: `setOptimizationMode('coverage')`.

- [ ] **Step 2: Send it in the POST body**

In `handleCreate`, add `optimizationMode` to the JSON body:
```ts
body: JSON.stringify({
  name: name.trim(),
  minGroupSize,
  maxGroupSize,
  deadlineAt: deadlineAt || null,
  optimizationMode,
}),
```

- [ ] **Step 3: Render the field**

Insert a new field block between the «Дедлайн» field block and the submit `<button type="submit">`, porting `ModeOption` + the `MODES` array + the `role="radiogroup"` container from `AdminMode.jsx`. Disable the options when `creating || !!activeSession` (match the other fields). Use these exact copy strings (from `AdminMode.jsx`):
- coverage: name «Покрытие», tag «по умолчанию», line «Собрать в группы как можно больше участников. Сценарии ранжируются по охвату — текущее поведение.»
- satisfaction: name «Удовлетворённость», tag «новый», line «Сначала качество совпадений: лучшие круги по интересам, даже если кто-то останется без группы.»
- satisfaction reveal bullets (only when selected): «Перед доской участник проходит экран ранжирования.» / «Без ранга участник не попадает в подбор.» / «Зафиксируется при создании, без переключения потом.»

Accent per option: `coverage → var(--success)`, `satisfaction → var(--accent)`. Square 13×13 indicator, inner 6×6 fill, `border-radius: var(--radius)`. Add `data-testid="matching-session-mode"` on the radiogroup and `data-testid="mode-option-satisfaction"` / `mode-option-coverage` on the two options for e2e.

- [ ] **Step 4: Verify build + lint**

Run: `npm run lint && npm run typecheck`
Expected: clean. No raw hex (grep the diff for `#` — only `var(--…)` allowed).

- [ ] **Step 5: Commit**

```bash
git add components/nd/AdminMatchingSession.tsx
git commit -m "feat(matching): add подбор mode selector to admin create-session form"
```

---

## Phase 3 — Gate filtering & intermediate screen

### Task 8: Thread mode + gate filtering into the two server input builders

**Files:**
- Modify: `lib/matching/scenario-input.ts`
- Modify: `app/matching/page.tsx`
- Modify: `app/api/matching/state/route.ts`

All three build a `GenerateScenariosInput`. Each must (a) read `optimizationMode` from the session row, (b) set `mode` on the input, (c) pass `signups` through `filterSignupsByMode`.

- [ ] **Step 1: `scenario-input.ts`**

- `fetchScenarioInputForSession(sessionId, minGroupSize, maxGroupSize, mode)` — add `mode: OptimizationMode` param (import the type). Apply the gate before returning:
```ts
import { filterSignupsByMode, type OptimizationMode } from './scenarios'
// ...
const signups = filterSignupsByMode(
  activeSignups.map((signup) => ({ userId: signup.userId, bookId: signup.bookId })),
  allRanks.map((rank) => ({ userId: rank.userId, bookId: rank.bookId, rank: rank.rank })),
  mode,
)
return { participants, books: /* unchanged */, signups, ranks: /* unchanged */, minGroupSize, maxGroupSize, maxResults: 10, mode }
```
- `fetchScenarioContextForSession(sessionId)` — select `optimizationMode` in the session query and pass it to `fetchScenarioInputForSession(..., matchingSession.optimizationMode as OptimizationMode)`. Pass `mode` to the `emptyScenarioSetOverview(...)` fallback.

- [ ] **Step 2: `app/matching/page.tsx`**

- The `activeSession` select uses `select()` (all columns) so `optimizationMode` is already present.
- In `fetchScenarioInput(participants, minGroupSize, maxGroupSize, mode)` add a `mode` param; apply `filterSignupsByMode` to the `activeSignups` mapping and set `mode` on the returned input. Update the call site to pass `activeSession.optimizationMode as OptimizationMode`.
- Pass `mode` to the `emptyScenarioSetOverview(...)` fallback.
- In `addMoveImpacts`, when building `nextOverview` via `generateScenarioSets({ ...scenarioInput, ... })`, the spread already carries `mode` — good. (Move-impact branch handled in Task 11.)

- [ ] **Step 3: `app/api/matching/state/route.ts`**

- `matchSession` uses `select()` → has `optimizationMode`.
- Build `mode` const: `const mode = (matchSession.optimizationMode ?? 'coverage') as OptimizationMode`.
- Apply gate to the `scenarioInput.signups` via `filterSignupsByMode(activeSignups.map(...), allRanks, mode)` and add `mode` to `scenarioInput`.
- Pass `mode` to both `emptyScenarioOverview`/`emptyScenarioSetOverview` calls (4th arg).
- `fetchMyMoves` / move impact handled in Task 11; for now ensure scenario generation uses mode.

- [ ] **Step 4: Verify existing tests + typecheck**

Run: `npm run typecheck && npx jest app/api/matching/state lib/matching`
Expected: clean / green. Coverage behaviour unchanged (mode defaults to coverage everywhere a real session is coverage).

- [ ] **Step 5: Commit**

```bash
git add lib/matching/scenario-input.ts app/matching/page.tsx app/api/matching/state/route.ts
git commit -m "feat(matching): thread mode and gate-filter unranked signups in input builders"
```

---

### Task 9: `MatchingPersonalList` deferred-commit support (for gate reuse)

**Files:**
- Modify: `components/nd/MatchingPersonalList.tsx`

Add an opt-in mode so the ranking gate can reuse the list without bouncing the user (no `router.refresh()` per action). Default behaviour (coverage board) is unchanged.

- [ ] **Step 1: Add props**

Extend `Props`:
```ts
  suppressRefresh?: boolean
  onChange?: (activeRankedCount: number) => void
```
Destructure with defaults `suppressRefresh = false`, `onChange`.

- [ ] **Step 2: Replace refresh calls conditionally**

Add a helper inside the component:
```ts
const activeRankedCount = (list: CatalogBook[]) =>
  list.filter((b) => b.isInList && b.personalStatus === null && b.rank != null).length

const notifyOrRefresh = useCallback((list: CatalogBook[]) => {
  if (suppressRefresh) onChange?.(activeRankedCount(list))
  else router.refresh()
}, [suppressRefresh, onChange, router])
```
Replace each `router.refresh()` call in `applyNewOrder`, `handleStatusChange`, `handleAddToList`, `handleRemoveFromList` with `notifyOrRefresh(<the list variable available in that scope>)` — use the reranked/merged list each handler already computes (`reranked`, `merged`, the `rerank(...)` result, etc.). In `handleAddToList`/`handleRemoveFromList` which use `setBooks((prev) => ...)`, compute the next list once, call `setBooks(next)` and `notifyOrRefresh(next)`.

- [ ] **Step 3: typecheck + run existing list tests**

Run: `npm run typecheck && npx jest MatchingPersonalList 2>/dev/null || true`
Expected: clean; existing board behaviour (suppressRefresh=false) unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/nd/MatchingPersonalList.tsx
git commit -m "feat(matching): add deferred-commit mode to MatchingPersonalList"
```

---

### Task 10: `MatchingRankingGate` component + render condition

**Files:**
- Create: `components/nd/MatchingRankingGate.tsx`
- Modify: `app/matching/page.tsx`

Reference for exact markup/copy/tokens: `docs/superpowers/specs/satisfaction/RankingGate.jsx` + `README.md` §"2".

- [ ] **Step 1: Build the component**

Create `components/nd/MatchingRankingGate.tsx` (`'use client'`). Props:
```ts
interface Props {
  books: CatalogBook[]                  // from fetchCatalogWithPersonalData
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
}
```
Structure (port styles verbatim from `RankingGate.jsx`):
- outer warm background + faint baseline grid (as `MatchingWelcome`).
- intro block: eyebrow «Режим: удовлетворённость · шаг перед доской», H1 «Сначала расставьте приоритеты», serif body (the `<em>` «сильнее всего» in `var(--accent)`).
- render `<MatchingPersonalList books={books} bookParticipants={bookParticipants} viewingUserId={viewingUserId} mutationUserId={mutationUserId} suppressRefresh onChange={setRankedCount} />` inside the two-column board layout container.
- sticky CTA footer: hint text (ranked vs empty variants from README) + button «Войти в подбор →».

Local state + behaviour:
```ts
const router = useRouter()
const initialRanked = books.filter((b) => b.isInList && b.personalStatus === null && b.rank != null).length
const [rankedCount, setRankedCount] = useState(initialRanked)
const canEnter = rankedCount >= 1
function enter() { if (canEnter) router.refresh() } // page re-renders → gate condition false → board
```
CTA `disabled={!canEnter}`, `onClick={enter}`. Add `data-testid="ranking-gate"` on the root and `data-testid="ranking-gate-enter"` on the CTA.

- [ ] **Step 2: Wire the render condition in `page.tsx`**

In `app/matching/page.tsx`, after `personalBooks` is fetched and before the main board return, compute:
```ts
const viewerHasRankedSignup = personalBooks.some(
  (b) => b.isInList && b.personalStatus === null && b.rank != null,
)
const mode = (activeSession.optimizationMode ?? 'coverage') as OptimizationMode
const showRankingGate =
  mode === 'satisfaction' &&
  !isImpersonating &&
  activeSession.status === 'active' &&
  !viewerHasRankedSignup

if (showRankingGate) {
  return (
    <MatchingRankingGate
      books={personalBooks}
      bookParticipants={clientBookParticipants}
      viewingUserId={clientViewingUserId}
    />
  )
}
```
Place this after `clientBookParticipants`/`clientViewingUserId` are computed (they are derived later in the function — move the gate return to just before the final `return (` so those vars exist, or compute the gate's pseudonymized inputs inline). Import `MatchingRankingGate` and `OptimizationMode`.

- [ ] **Step 3: typecheck + lint**

Run: `npm run lint && npm run typecheck`
Expected: clean. Grep diff for raw hex — none.

- [ ] **Step 4: Commit**

```bash
git add components/nd/MatchingRankingGate.tsx app/matching/page.tsx
git commit -m "feat(matching): add ranking gate intermediate screen for satisfaction sessions"
```

---

## Phase 4 — Moves by mode

### Task 11: `move-impact` satisfaction branch

**Files:**
- Modify: `lib/matching/move-impact.ts`
- Modify: `app/matching/page.tsx` (pass mode to `buildMoveImpact` + `sortMovesByImpact`)
- Modify: `app/api/matching/state/route.ts` (same)
- Test: `lib/matching/__tests__/move-impact.test.ts` (create if missing — check first)

- [ ] **Step 1: Write failing test**

Check whether `lib/matching/__tests__/move-impact.test.ts` exists (`ls lib/matching/__tests__`). If not, create it. Add a test where coverage is flat but the viewer gets a strictly better rank, and assert the satisfaction branch returns a non-null impact while the coverage branch returns null:

```ts
import { buildMoveImpact } from '../move-impact'
import type { MatchingScenario } from '../scenarios'

// Build a currentLeader where viewer 'me' sits on bookOld at rank 4,
// and a simulated scenario where 'me' sits on bookNew at rank 1, coverage identical.
// (Construct minimal MatchingScenario objects with the required score fields.)

it('satisfaction: counts a flat-coverage rank improvement as meaningful', () => {
  const impact = buildMoveImpact({ move, scenario: better, currentLeader, viewingUserId: 'me', bookTitleById, mode: 'satisfaction' })
  expect(impact).not.toBeNull()
})
it('coverage: same flat-coverage move is not meaningful', () => {
  const impact = buildMoveImpact({ move, scenario: better, currentLeader, viewingUserId: 'me', bookTitleById, mode: 'coverage' })
  expect(impact).toBeNull()
})
```
(Fill `move`, `better`, `currentLeader`, `bookTitleById` with concrete minimal objects — model them on the shapes in `move-impact.ts`/`my-moves.ts`. `better` must place `me` in a circle on the moved book at rank 1; `currentLeader` places `me` at rank 4 on another book; both scenarios cover the same userIds.)

- [ ] **Step 2: Run, expect fail**

Run: `npx jest lib/matching/__tests__/move-impact.test.ts`
Expected: FAIL — `buildMoveImpact` has no `mode` param.

- [ ] **Step 3: Implement the branch**

In `lib/matching/move-impact.ts`:

1. Add `mode: OptimizationMode` to `MoveImpactInput` (import the type from `./scenarios`).
2. Add a satisfaction-specific meaningfulness gate. Compute viewer's before/after rank:
```ts
const viewerAfter = moveCircle.members.find((m) => m.userId === viewingUserId)?.rank ?? null
const viewerBeforePlace = placeBefore.get(viewingUserId) // bookId+interest of viewer's current placement
// viewer's current rank: look up in currentLeader circle membership
const viewerBeforeRank = currentLeader?.circles
  .flatMap((c) => c.members)
  .find((m) => m.userId === viewingUserId)?.rank ?? null
```
3. Replace the `meaningfulBeneficiaries.length === 0 → null` gate with a mode switch:
```ts
if (mode === 'satisfaction') {
  const wasLeftOut = viewerBeforeRank === null && !viewerBeforePlace
  const improvedRank =
    viewerAfter !== null && viewerBeforeRank !== null && viewerAfter < viewerBeforeRank
  if (!wasLeftOut && !improvedRank) return null
} else {
  if (meaningfulBeneficiaries.length === 0) return null
}
```
4. Add a `satisfaction` field to the returned impact for the UI/sort:
```ts
satisfaction: { before: viewerBeforeRank, after: viewerAfter },
```
Add `satisfaction?: { before: number | null; after: number | null }` to `MyMoveBook['impact']` in `my-moves.ts`.
5. `sortMovesByImpact` → add `mode` param. In satisfaction, sort by viewer improvement (treat leftOut→placed as the biggest gain):
```ts
export function sortMovesByImpact<T extends Pick<MyMoveBook, 'title' | 'impact'>>(moves: T[], mode: OptimizationMode = 'coverage'): T[] {
  if (mode === 'satisfaction') {
    const gain = (m: T) => {
      const s = m.impact?.satisfaction
      if (!s) return -Infinity
      if (s.before === null) return Number.MAX_SAFE_INTEGER // was left out → max gain
      return (s.before ?? 0) - (s.after ?? 0)
    }
    return [...moves].sort((a, b) => gain(b) - gain(a) || a.title.localeCompare(b.title, 'ru'))
  }
  // ...existing coverage sort unchanged...
}
```

- [ ] **Step 4: Pass mode at call sites**

- `app/matching/page.tsx` `addMoveImpacts`: add a `mode` param (read from the session), pass `mode` into `buildMoveImpact({ ..., mode })` and `sortMovesByImpact(..., mode)`.
- `app/api/matching/state/route.ts`: when building moves with impact (it currently returns `myMoves` without impact — confirm; if it does not call `buildMoveImpact`, leave moves as-is but ensure scenario `mode` is set; if it does, pass `mode`).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npx jest lib/matching/__tests__/move-impact.test.ts lib/matching/__tests__/scenarios.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/matching/move-impact.ts lib/matching/my-moves.ts app/matching/page.tsx app/api/matching/state/route.ts lib/matching/__tests__/move-impact.test.ts
git commit -m "feat(matching): branch move impact and sorting by optimization mode"
```

---

## Phase 5 — UI copy by mode

### Task 12: Neutral satisfaction copy in scenarios UI

**Files:**
- Modify: `components/nd/MatchingImpactWorkspace.tsx`
- Modify: `components/nd/MatchingScenarios.tsx`

Reference: `docs/superpowers/specs/satisfaction/Scenarios.jsx` + `README.md` §"3". `overview.mode` is now available (Task 1).

- [ ] **Step 1: Workspace passes mode down**

In `MatchingImpactWorkspace.tsx`, read `const mode = overview.mode` and pass `mode={mode}` to `<MatchingScenarios ... />` and `<MatchingMyMoves ... />` and `<MatchingAdriftBanner ... />`. Adjust the scenarios panel heading/sub copy when `mode === 'satisfaction'` to the README copy: heading «Сценарии», sub «Расклады по близости интересов. Порядок — только для однозначного вывода: при равном качестве показываются все варианты, выбор за вами.»

- [ ] **Step 2: Scenarios card branches on mode**

In `MatchingScenarios.tsx`, add `mode?: OptimizationMode` to `Props`. When `mode === 'satisfaction'`:
- header label «Сценарий N» (uppercase `0.7rem` `letter-spacing:0.1em` `var(--text-muted)`), no «лучший» tier badge, no accent-soft leader background — equal-weight cards.
- primary metric pill «средний ранг X.X» (from `scenario.score.avgRank`), coverage muted right-aligned «охват: N из M».
- «За бортом» rendered neutrally («Пока без круга: …», `var(--text-secondary)`, viewer bold + « · вы», no warning colour).
Keep the coverage rendering path exactly as-is for `mode !== 'satisfaction'`.

- [ ] **Step 3: typecheck + lint + UI test**

Run: `npm run lint && npm run typecheck`
Expected: clean. Grep diff for raw hex — none.

- [ ] **Step 4: Commit**

```bash
git add components/nd/MatchingImpactWorkspace.tsx components/nd/MatchingScenarios.tsx
git commit -m "feat(matching): neutral satisfaction copy and quality-first scenario cards"
```

---

### Task 13: Mode-aware moves copy

**Files:**
- Modify: `components/nd/MatchingMyMoves.tsx`

Reference: spec §5, README §Interactions.

- [ ] **Step 1: Add mode prop + copy branch**

Add `mode?: OptimizationMode` to `Props`. In `ImpactMetricPills` and `MoveWhyText`, when `mode === 'satisfaction'`, use satisfaction framing instead of coverage:
- metric pill: show rank improvement using `move.impact.satisfaction` (e.g. «↑ ранг {before}→{after}» or «соберётся круг» when was leftOut), not «Покрытие».
- why text: «соберёт круг, где интересы совпадают лучше» / when viewer was leftOut «… и вы соберётесь в круг»; co-members shown as context.
- empty state «нет ходов»: neutral phrasing per mode.
Keep coverage strings unchanged for `mode !== 'satisfaction'`.

- [ ] **Step 2: typecheck + lint**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/nd/MatchingMyMoves.tsx
git commit -m "feat(matching): satisfaction-mode copy in My Moves"
```

---

### Task 14: Softened adrift banner

**Files:**
- Modify: `components/nd/MatchingAdriftBanner.tsx`

Reference: `docs/superpowers/specs/satisfaction/Adrift.jsx` + README §"4".

- [ ] **Step 1: Add variant**

Add `mode?: OptimizationMode` to `Props`. Compute `const soft = mode === 'satisfaction'`. Swap, exactly per `Adrift.jsx`:
- surface `var(--bg-input)` vs `var(--status-warn-soft)`; border `var(--hair)` vs warn-mix; left bar `var(--accent)` vs `var(--status-warn)`.
- icon info-dot (22×22, `var(--accent-soft)` bg, serif `i` in `var(--accent)`) vs `⚠`.
- title «Вы пока не в круге» vs «Вы за бортом».
- body + extra reassurance line (soft only) — exact strings from `Adrift.jsx`.
- CTA «Где совпадают интересы →» (`var(--accent)`, `border-radius: var(--radius-control)`) vs «Как вернуться в круг →»; CTA subnote «подсказки в „Моих ходах“» vs «добавьте книгу из „Моих ходов“».
Update the hover `<style>` rule so the soft variant hovers on `var(--accent-hover)` rather than darkening the warn colour.

- [ ] **Step 2: Pass mode from workspace**

(Already added in Task 12.) Confirm `MatchingImpactWorkspace` passes `mode` to `MatchingAdriftBanner`.

- [ ] **Step 3: typecheck + lint**

Run: `npm run lint && npm run typecheck`
Expected: clean. Grep diff for raw hex — none (note: existing file already uses `color-mix(... var(--status-warn) ...)` which is allowed as it references a token).

- [ ] **Step 4: Commit**

```bash
git add components/nd/MatchingAdriftBanner.tsx
git commit -m "feat(matching): soften adrift banner in satisfaction mode"
```

---

## Phase 6 — End-to-end

### Task 15: E2E flow for satisfaction sessions

**Files:**
- Create: `e2e/matching-satisfaction.spec.ts`
- Possibly modify: `e2e/fixtures.ts` (add a `optimizationMode` option to the session-creation fixture if one exists)

Reference: CLAUDE.md E2E rules (prod-DB isolation via fixtures, `page.reload()` for persistence, `networkidle` for hydration, fill ContactsForm first if it appears).

- [ ] **Step 1: Extend the session fixture**

Read `e2e/fixtures.ts`. If there is a fixture that creates a matching session, add an optional `optimizationMode` parameter (default `'coverage'`) that posts to `/api/matching/sessions` (or inserts directly) with the mode. Keep teardown/cleanup as the existing fixture does.

- [ ] **Step 2: Write the spec**

Create `e2e/matching-satisfaction.spec.ts` covering:
1. Admin creates a satisfaction session (fixture) with ≥ `minGroupSize` participants, books created via `createTestBook`.
2. A participant **without ranks** lands on `/matching` and sees `[data-testid="ranking-gate"]`, NOT the board scenarios panel.
3. The participant adds/orders ≥1 book in the gate, clicks `[data-testid="ranking-gate-enter"]`, and the board appears with them present in a scenario.
4. Scenario order respects satisfaction (assert the first card's «средний ранг» ≤ the second's, or that a known perfect circle is in Сценарий 1).
5. **`page.reload()`** after ranking → still on the board (not bounced to the gate), state persisted.
All mutations via fixtures; new books via `createTestBook`; wait for `networkidle` before interacting.

- [ ] **Step 3: Run the spec**

Run (from main checkout, dev server managed by Playwright): `npm run playwright test e2e/matching-satisfaction.spec.ts`
Expected: PASS. (E2E is not in the merge gate but must pass locally before commit.)

- [ ] **Step 4: Commit**

```bash
git add e2e/matching-satisfaction.spec.ts e2e/fixtures.ts
git commit -m "test(matching): e2e for satisfaction session ranking gate and scenario order"
```

---

## Phase 7 — Docs & integration

### Task 16: Wiki + feature docs

**Files:**
- Modify: `docs/wiki/Group-Matching-Mode.md` (document the new mode, gate, and that mode is fixed at creation)
- Modify: `docs/features/` matching doc if one exists (check `docs/features/`)

- [ ] **Step 1: Update docs**

Add a «Режим расчёта (coverage / satisfaction)» section to `docs/wiki/Group-Matching-Mode.md`: what each mode optimises, that it is chosen at session creation and fixed, the ranking gate, and the softened «за бортом» framing. Mention the `optimization_mode` column and that coverage is the default/unchanged path.

- [ ] **Step 2: Commit**

```bash
git add docs/wiki/Group-Matching-Mode.md docs/features/
git commit -m "docs(matching): document satisfaction mode, gate, and mode-at-creation"
```

---

### Task 17: Open PR with CI gate

- [ ] **Step 1: Final full check**

Run (from main checkout): `npm run lint && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin <current-branch>
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view <num> --json mergeStateStatus,mergeable
```
Then background-watch CI per CLAUDE.md rule 2; react to BEHIND/CONFLICTING/failure without returning control.

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 5. ✅
- §2 session creation → Tasks 6 (API), 7 (admin form). ✅
- §3 comparator (circle quality avg→worst, scenario lexicographic, mode selection, tiers) → Tasks 2, 3. ✅
- §4 gate filtering + intermediate screen → Tasks 4 (helper), 8 (filtering wired), 9 (list reuse), 10 (gate + render condition). ✅
- §5 moves by mode → Task 11. ✅
- §6 UI copy (scenarios, adrift) → Tasks 12, 14; moves copy 13. ✅
- §7 tests → unit in Tasks 2,3,4,6,11; e2e Task 15. ✅
- §8 file map → covered across tasks. ✅
- §9 implementation order → matches Phase 1→7. ✅
- §10 risks (coverage path untouched) → enforced by mode-default `'coverage'` and additive tests. ✅
- §11 open defaults (≥1 ranked, silent commit, impersonation bypass, weak groups last) → Tasks 10 (≥1 + bypass via `!isImpersonating`), 9 (silent commit), 3 (weak groups emerge from comparator). ✅
- UI README 4 surfaces → Tasks 7, 10, 12, 14. ✅

**Placeholder scan:** Task 6 and 11 reference matching the existing test-suite mock shapes ("as existing test does") rather than pasting them — the implementer must read those files first; flagged explicitly in-step. All implementation steps contain concrete code.

**Type consistency:** `OptimizationMode` defined in `scenarios.ts` (Task 1) and imported everywhere. `mode` field name consistent across input/overview/props. `filterSignupsByMode`, `compareCircleSatisfaction`, `compareScenarioSatisfaction`, `circleComparator`, `scenarioComparator`, `assignScenarioTiers(…, mode)` names consistent between definition (Tasks 2–4) and use (Task 3, 8). `impact.satisfaction` shape consistent between `move-impact.ts` and `my-moves.ts` (Task 11).

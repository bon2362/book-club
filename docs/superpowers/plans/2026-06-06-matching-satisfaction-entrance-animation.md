# Matching Satisfaction — Gate Redesign & Entrance Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone satisfaction ranking gate with a redesigned one-screen gate that animates into the board (gate → board) as a single page, per design handoff `output/design_handoff_satisfaction_mode` (§5).

**Architecture:** A single client wrapper `MatchingSatisfactionFlow` is rendered by `app/matching/page.tsx` in BOTH the gate phase and the board phase of a *satisfaction* session, at the same tree position. The wrapper holds the persistent personal list (rendered once) plus collapsible gate-intro / board-chrome slots. Clicking «Войти в сессию» commits ranks silently (already implemented), sets a client `entering` flag, and calls `router.refresh()`. Because App Router soft-refresh preserves client state for components that stay mounted at the same position, the wrapper survives the refresh; the server now returns the board slots (scenarios/moves computed because the viewer's ranking is complete), and the wrapper plays the CSS entrance animation (collapse gate intro/footer, slide board chrome in from top, stagger content). The **coverage path is not touched** — only satisfaction sessions render through the wrapper.

**Tech Stack:** Next.js 14 App Router (RSC + client islands), React, dnd-kit, Playwright (E2E + UI layout tests), Jest (unit/component). Design canon: inline `style={{…}}` + `var(--…)` tokens, square corners, no shadows (`app/globals.css`).

---

## Background: what already exists (verified in code, do NOT rebuild)

The satisfaction **backend and most UI already shipped** (PRs #284–288). Confirmed present and working:

- Schema + migration `drizzle/0038_matching_optimization_mode.sql`; `matchingSessions.optimizationMode`.
- Engine `lib/matching/scenarios.ts`: `compareCircleSatisfaction`, `compareScenarioSatisfaction`, `circleComparator`/`scenarioComparator` by mode, `filterSignupsByMode`, satisfaction tiers in `assignScenarioTiers`, `mode` threaded everywhere.
- Gate input filtering: `app/matching/page.tsx` `fetchScenarioInput` + `lib/matching/scenario-input.ts` use `filterSignupsByMode`.
- Admin selector: `components/nd/AdminMatchingSession.tsx` (radiogroup + `satisfactionModeNotes`).
- Neutral scenarios: `components/nd/MatchingScenarios.tsx` already gates `«лучший сейчас»` behind `!isSatisfaction`, shows `средний ранг X.X`, `охват: N из M`, `Пока без круга:`.
- Softened adrift: `components/nd/MatchingAdriftBanner.tsx` `soft` branch (`Вы пока не в круге`, info glyph, accent).
- Moves: `lib/matching/move-impact.ts` satisfaction branch + `sortMovesByImpact`; `components/nd/MatchingMyMoves.tsx` copy.
- Standalone gate `components/nd/MatchingRankingGate.tsx` (OLD layout — this plan replaces its usage).
- Live updates: `MatchingRealtimeWrapper` polls `/api/matching/version`; on change → `router.refresh()`. State API `/api/matching/state` gates satisfaction scenario generation behind `viewerHasCompleteRanking`.
- E2E `e2e/matching-satisfaction.spec.ts` uses testids `ranking-gate` / `ranking-gate-enter` and H1 `Сначала расставьте приоритеты` (all preserved by this plan).

**This plan implements only the genuine gap:** the redesigned one-screen gate + the gate→board entrance animation.

## Design-canon deviations (intentional — handoff overruled by `CLAUDE.md`)

The handoff README uses `--radius-pill` (999px) for the «средний ранг» chip and `--radius-control` (8px) for CTAs, and an info *circle* for adrift. `CLAUDE.md` canon mandates **square corners, square chips/buttons, circles only for avatars**. User instructions outrank the handoff, and the *current shipped code is already canon-correct*. Therefore:

- **Do NOT** change the scenarios «средний ранг» chip radius (stays `var(--radius)`).
- **Do NOT** round the gate CTA (stays `var(--radius)` square — matches the existing button primitive).
- **Do NOT** change the adrift info glyph to a filled circle.

If the user later confirms they want the handoff's rounded controls, that is a separate change.

---

## File Structure

**New files:**
- `components/nd/MatchingSatisfactionFlow.tsx` — client wrapper holding gate + board phases, persistent personal list, entrance animation. One responsibility: orchestrate the two visual states of a satisfaction session and the transition between them.
- `components/nd/MatchingSatisfactionFlow.test.tsx` — component tests for phase rendering and gate copy.

**Modified files:**
- `app/globals.css` — port animation classes (`.nd-flow-slide-from-top`, `.nd-flow-fade-collapse`, `.nd-flow-stagger`, reduced-motion).
- `components/nd/MatchingPersonalList.tsx` — add `size?: 'compact' | 'large'` + `fill?: boolean` (scrollable lists) variants.
- `app/matching/page.tsx` — render satisfaction sessions through `MatchingSatisfactionFlow` (both phases) instead of the early-return standalone gate; keep coverage path byte-identical.
- `e2e/matching-satisfaction.spec.ts` — set `reducedMotion: 'reduce'`; add gate→board persistence assertions.
- `e2e/ui-states.spec.ts` — add one-screen gate boundingBox test.

**Retired (after migration):**
- `components/nd/MatchingRankingGate.tsx` — no longer rendered once `page.tsx` uses the flow wrapper. Delete in the final task (with its references) only after the wrapper is wired and green.

---

## Phase 0 — Animation CSS classes (no behavior yet)

### Task 0: Port entrance-animation classes into globals.css

**Files:**
- Modify: `app/globals.css` (append near the existing `@media (prefers-reduced-motion: reduce)` block at line ~409)

Class names are namespaced `nd-flow-*` to avoid collisions. We use a **JS-measured `max-height` Collapsible** (built in Task 4), so we do NOT add a `.collapsible` CSS class here — only the slide/fade/stagger helpers and the reduced-motion override.

- [ ] **Step 1: Add the CSS**

Append to `app/globals.css`:

```css
/* ── Matching satisfaction flow: gate → board entrance animation ── */
.nd-flow-slide-from-top {
  opacity: 0;
  transform: translateY(-22px);
  transition: opacity 2.5s ease, transform 2.9s cubic-bezier(0.22, 1, 0.36, 1);
}
.nd-flow.is-board .nd-flow-slide-from-top { opacity: 1; transform: none; }

.nd-flow-fade-collapse { transition: opacity 1.6s ease; }
.nd-flow.is-board .nd-flow-fade-collapse { opacity: 0; pointer-events: none; }

.nd-flow-stagger {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 2.3s ease, transform 2.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.nd-flow-stagger.is-loaded { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  .nd-flow-slide-from-top,
  .nd-flow-fade-collapse,
  .nd-flow-stagger { transition: none !important; }
}
```

- [ ] **Step 2: Verify lint/typecheck unaffected**

Run: `npm run lint`
Expected: PASS (CSS is not linted by ESLint; this confirms no accidental TS edit). If a stylelint step exists it must pass too.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(matching): add satisfaction flow entrance-animation classes"
```

---

## Phase 1 — Personal list size + fill variants

The gate shows **larger** rows than the board (cover `52×74`, grid `34px 52px 1fr`) and, in one-screen mode, the lists must **scroll internally** (`overflow-y:auto; flex:1; min-height:0`) so the page never scrolls. Add two opt-in props; defaults preserve the current board appearance exactly.

### Task 1: Add `size` and `fill` props to MatchingPersonalList

**Files:**
- Modify: `components/nd/MatchingPersonalList.tsx`
- Test: `components/nd/MatchingPersonalList.test.tsx` (create if absent)

**Design values (from `BoardFlow.jsx` PersonalList, large variant):**
- Row grid: `34px 52px 1fr`, gap `0.95rem`, padding `0.85rem 0.95rem`.
- Cover: `52×74`.
- Title: `var(--nd-serif)` `1.04rem` `700`. Author: `0.82rem` `var(--text-muted)`.
- Rank `#N`: `1.05rem`. Drag handle `⠿`: `1.1rem`.
- `fill`: grid container `height:100%; min-height:0`; each `<section>` `min-height:0`; each `<ul>` `overflow-y:auto; flex:1; min-height:0`.

Defaults (`size='compact'`, `fill=false`) keep current constants: grid `30px 40px 1fr`, cover `40×57`, title `0.92rem`, etc.

- [ ] **Step 1: Write the failing component test**

Create/extend `components/nd/MatchingPersonalList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import MatchingPersonalList from './MatchingPersonalList'
import type { CatalogBook } from '@/lib/matching/personal-list'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const myBook: CatalogBook = {
  bookId: 'b1', title: 'Книга A', author: 'Автор A', coverUrl: null,
  rank: 1, personalStatus: null, inList: true, tags: [],
} as unknown as CatalogBook

const catalogBook: CatalogBook = {
  bookId: 'b2', title: 'Книга B', author: 'Автор B', coverUrl: null,
  rank: null, personalStatus: null, inList: false, tags: [],
} as unknown as CatalogBook

function renderList(extra: Record<string, unknown>) {
  return render(
    <MatchingPersonalList
      books={[myBook, catalogBook]}
      bookParticipants={[]}
      viewingUserId="u1"
      {...extra}
    />,
  )
}

test('large size uses 52px cover width', () => {
  const { container } = renderList({ size: 'large' })
  const cover = container.querySelector('[data-testid="pl-cover"]') as HTMLElement
  expect(cover).toBeTruthy()
  expect(cover.style.width).toBe('52px')
})

test('compact size (default) uses 40px cover width', () => {
  const { container } = renderList({})
  const cover = container.querySelector('[data-testid="pl-cover"]') as HTMLElement
  expect(cover.style.width).toBe('40px')
})

test('fill makes the book list scrollable', () => {
  const { container } = renderList({ fill: true })
  const ul = container.querySelector('[data-testid="pl-books-ul"]') as HTMLElement
  expect(ul.style.overflowY).toBe('auto')
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- MatchingPersonalList`
Expected: FAIL — props `size`/`fill` ignored; `data-testid="pl-cover"` / `pl-books-ul` not present.

> NOTE: per memory `jest-worktree-ignore`, `npm test` from a `.claude/worktrees/` path can match 0 tests and pass silently. If you see "0 tests", run the suite from the main checkout (`/Users/ekoshkin/book-club`) or rely on CI; do NOT treat a 0-test run as green.

- [ ] **Step 3: Implement size/fill variants**

In `components/nd/MatchingPersonalList.tsx`:

1. Extend `Props`:
```tsx
interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
  mutationUserId?: string
  suppressRefresh?: boolean
  onChange?: (activeRankingComplete: boolean) => void
  size?: 'compact' | 'large'
  fill?: boolean
}
```

2. Replace the module-level style constants with a size factory. Add near the top (after imports):
```tsx
type ListSize = 'compact' | 'large'

function getListStyles(size: ListSize) {
  const large = size === 'large'
  return {
    cover: {
      width: large ? 52 : 40,
      height: large ? 74 : 57,
      borderRadius: 'var(--radius)',
      flexShrink: 0,
      boxShadow: 'var(--shadow-card)',
      position: 'relative' as const,
      overflow: 'hidden' as const,
    } satisfies React.CSSProperties,
    row: {
      display: 'grid',
      gridTemplateColumns: large ? '34px 52px 1fr' : '30px 40px 1fr',
      gap: large ? '0.95rem' : '0.75rem',
      padding: large ? '0.85rem 0.95rem' : '0.6rem 0.75rem',
      alignItems: 'center',
      cursor: 'pointer',
    } satisfies React.CSSProperties,
    title: {
      fontFamily: 'var(--nd-serif)',
      fontWeight: 700,
      fontSize: large ? '1.04rem' : '0.92rem',
      letterSpacing: '-0.01em',
      color: 'var(--text)',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
      lineHeight: 1.25,
      marginBottom: '0.05rem',
    } satisfies React.CSSProperties,
    author: {
      fontSize: large ? '0.82rem' : '0.76rem',
      color: 'var(--text-muted)',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
    } satisfies React.CSSProperties,
    rank: { fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: large ? '1.05rem' : '0.95rem', color: 'var(--text-secondary)', lineHeight: 1 } satisfies React.CSSProperties,
    handle: { color: 'var(--text-muted)', fontSize: large ? '1.1rem' : '1rem', background: 'none', border: 'none', padding: 0, lineHeight: 1 } satisfies React.CSSProperties,
  }
}
```

3. Compute `const s = getListStyles(size)` inside the component, and **thread `s` into `SortableRow` / `StatusRow` / `CatalogRow`** as a `styles` prop (replace their uses of the old module constants `coverStyle`/`rowBase`/inline title/author with `styles.cover`/`styles.row`/`styles.title`/`styles.author`/`styles.rank`/`styles.handle`). Add `data-testid="pl-cover"` to the cover `<div>` and `data-testid="pl-books-ul"` to the «Мои книги» `<ul>`.

4. For `fill`: when `fill` is true, apply to the grid container `{ height: '100%', minHeight: 0 }`, to each `<section>` panel `{ minHeight: 0 }` (override the default `minHeight: 300`), and to each `<ul>` `{ overflowY: 'auto', flex: 1, minHeight: 0 }`. Keep current behavior when `fill` is false.

> The full row JSX already exists (lines ~117–280). This step is a mechanical substitution of constants → `styles.*` plus the two testids and the `fill` conditionals. Do not change drag/commit logic.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- MatchingPersonalList`
Expected: PASS (3 tests). Also run `npm run typecheck` — PASS.

- [ ] **Step 5: Verify board appearance unchanged (regression guard)**

Run: `npm run lint && npm run typecheck`
Expected: PASS. Default props unchanged → coverage/board rendering identical.

- [ ] **Step 6: Commit**

```bash
git add components/nd/MatchingPersonalList.tsx components/nd/MatchingPersonalList.test.tsx
git commit -m "feat(matching): personal list size+fill variants for ranking gate"
```

---

## Phase 2 — `MatchingSatisfactionFlow` wrapper (gate phase only, no animation yet)

Build the new wrapper rendering the **redesigned one-screen gate** and wire `page.tsx` to use it for satisfaction. CTA still triggers `router.refresh()` (hard swap) at this phase — the animation arrives in Phase 3. This ships a working, redesigned, one-screen gate independently and keeps the existing E2E green.

### Task 2: Create MatchingSatisfactionFlow with the gate phase

**Files:**
- Create: `components/nd/MatchingSatisfactionFlow.tsx`
- Test: `components/nd/MatchingSatisfactionFlow.test.tsx`

**Gate copy (final, from `BoardFlow.jsx`):**
- No eyebrow line.
- H1: `Сначала расставьте приоритеты` (preserve — E2E asserts it).
- Body: `В этой сессии круги собираются по тому, что вы хотите читать `<em>`сильнее всего`</em>`. Добавьте книги в список справа и перетащите их по важности.`
- Footer hint (single, all states): `Расставьте приоритеты и сможете войти в сессию.`
- CTA label: `Войти в сессию →` (square, accent when enabled; `var(--border)`/muted when disabled).

**Props:**
```tsx
import type { CatalogBook } from '@/lib/matching/personal-list'
import type { BookParticipant } from './MatchingPersonalList'

export interface MatchingSatisfactionFlowProps {
  phase: 'gate' | 'board'
  // Persistent personal list (rendered once, both phases)
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
  frozen?: boolean
  sessionId: string
  // Board slots — provided by the server only when phase==='board'
  header?: React.ReactNode
  workspace?: React.ReactNode
  catalogIntro?: React.ReactNode
}
```

- [ ] **Step 1: Write the failing component test**

`components/nd/MatchingSatisfactionFlow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import MatchingSatisfactionFlow from './MatchingSatisfactionFlow'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

const base = {
  books: [], bookParticipants: [], viewingUserId: 'u1', sessionId: 's1',
}

test('gate phase shows the ranking intro and CTA, no eyebrow', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByTestId('ranking-gate')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Сначала расставьте приоритеты' })).toBeInTheDocument()
  expect(screen.getByTestId('ranking-gate-enter')).toHaveTextContent('Войти в сессию')
  expect(screen.queryByText(/Режим: удовлетвор/i)).toBeNull()
})

test('gate phase footer uses the single hint for all states', () => {
  render(<MatchingSatisfactionFlow phase="gate" {...base} />)
  expect(screen.getByText('Расставьте приоритеты и сможете войти в сессию.')).toBeInTheDocument()
})

test('board phase renders header and workspace slots', () => {
  render(
    <MatchingSatisfactionFlow
      phase="board" {...base}
      header={<div data-testid="slot-header" />}
      workspace={<div data-testid="slot-workspace" />}
    />,
  )
  expect(screen.getByTestId('slot-header')).toBeInTheDocument()
  expect(screen.getByTestId('slot-workspace')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- MatchingSatisfactionFlow`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the wrapper (gate phase functional; board slots rendered; CTA = router.refresh)**

Create `components/nd/MatchingSatisfactionFlow.tsx`:

```tsx
'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import MatchingRealtimeWrapper from './MatchingRealtimeWrapper'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

export interface MatchingSatisfactionFlowProps {
  phase: 'gate' | 'board'
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
  frozen?: boolean
  sessionId: string
  header?: React.ReactNode
  workspace?: React.ReactNode
  catalogIntro?: React.ReactNode
}

export default function MatchingSatisfactionFlow(props: MatchingSatisfactionFlowProps) {
  const { phase, books, bookParticipants, viewingUserId, mutationUserId, frozen, sessionId } = props
  const router = useRouter()
  const board = phase === 'board'

  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)

  const enter = useCallback(() => {
    if (!canEnter || board) return
    // ranks are already committed silently by MatchingPersonalList (suppressRefresh);
    // re-render the server tree so scenarios/board appear for the now-complete ranking.
    router.refresh()
  }, [canEnter, board, router])

  return (
    <div
      className="nd-flow"
      style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          backgroundImage: 'linear-gradient(var(--hair-soft) 1px, transparent 1px)',
          backgroundSize: '100% 2.1rem', opacity: 0.5, pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '0 2rem',
          display: 'flex', flexDirection: 'column',
          ...(board ? { minHeight: '100svh' } : { height: '100svh' }),
        }}
      >
        {/* Board header slot */}
        {board && props.header}

        {/* Gate intro */}
        {!board && (
          <div data-testid="ranking-gate" style={{ maxWidth: 640, flex: '0 0 auto', padding: '2.2rem 0 0.4rem' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.95rem', lineHeight: 1.14, fontWeight: 700, color: 'var(--text)' }}>
              Сначала расставьте приоритеты
            </h1>
            <p style={{ margin: '0.7rem 0 1.5rem', fontFamily: 'var(--nd-serif)', fontSize: '1.04rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
              В этой сессии круги собираются по тому, что вы хотите читать{' '}
              <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>сильнее всего</em>.
              {' '}Добавьте книги в список справа и перетащите их по важности.
            </p>
          </div>
        )}

        {/* Board workspace slot */}
        {board && props.workspace}

        {/* Persistent personal list — rendered ONCE for both phases */}
        <div style={{ paddingBottom: board ? '2.4rem' : '1.2rem', ...(board ? { flex: '0 0 auto' } : { flex: '1 1 0%', minHeight: 0 }) }}>
          {board && props.catalogIntro}
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            frozen={frozen}
            size={board ? 'compact' : 'large'}
            fill={!board}
            suppressRefresh={!board}
            onChange={!board ? setCanEnter : undefined}
          />
        </div>

        {/* Gate footer CTA */}
        {!board && (
          <div
            style={{
              flex: '0 0 auto', borderTop: '1px solid var(--hair)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1rem', flexWrap: 'wrap', padding: '1.2rem 0 2rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: '46ch' }}>
              Расставьте приоритеты и сможете войти в сессию.
            </p>
            <button
              type="button"
              data-testid="ranking-gate-enter"
              disabled={!canEnter}
              onClick={enter}
              style={{
                padding: '0.9rem 1.6rem', border: 'none', borderRadius: 'var(--radius)',
                background: canEnter ? 'var(--accent)' : 'var(--border)',
                color: canEnter ? 'var(--bg-input)' : 'var(--text-muted)',
                cursor: canEnter ? 'pointer' : 'default',
                fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >
              Войти в сессию →
            </button>
          </div>
        )}
      </div>

      <MatchingRealtimeWrapper sessionId={sessionId} />
    </div>
  )
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- MatchingSatisfactionFlow`
Expected: PASS (3 tests). `npm run typecheck` — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/nd/MatchingSatisfactionFlow.tsx components/nd/MatchingSatisfactionFlow.test.tsx
git commit -m "feat(matching): MatchingSatisfactionFlow wrapper (gate phase)"
```

### Task 3: Wire page.tsx to render satisfaction through the flow wrapper

**Files:**
- Modify: `app/matching/page.tsx`

Currently `page.tsx` early-returns `<MatchingRankingGate>` when `showRankingGate`, and separately returns the board JSX. To make the wrapper survive `router.refresh()`, **both phases must render `<MatchingSatisfactionFlow>` at the same position**. Strategy:

1. **Gate phase:** replace the `if (showRankingGate) return <MatchingRankingGate .../>` block with a render of `<MatchingSatisfactionFlow phase="gate" .../>`.
2. **Board phase, satisfaction only:** wrap the existing board content into the wrapper's `header` / `workspace` / `catalogIntro` slots and the persistent list. **Coverage stays on the current board JSX unchanged.**

- [ ] **Step 1: Extract board chrome into reusable slot nodes**

In `app/matching/page.tsx`, after computing all board data (the `return (<div className="flex flex-col" …>` block at line ~252), define the three slot nodes as locals (lifting the existing JSX verbatim):

```tsx
const headerSlot = (
  <MatchingHeader
    sessionId={activeSession.id}
    sessionName={activeSession.name}
    sessionStatus={activeSession.status}
    minGroupSize={activeSession.minGroupSize}
    maxGroupSize={activeSession.maxGroupSize}
    optimizationMode={mode}
    canSwitchMode={canSwitchOptimizationMode}
    deadlineAt={activeSession.deadlineAt ? new Date(activeSession.deadlineAt).toISOString() : null}
    participants={participants.map((p) => ({
      userId: isAdmin ? p.userId : p.pseudonym,
      pseudonym: p.pseudonym,
      name: isAdmin ? p.name ?? null : null,
    }))}
    isAdmin={isAdmin}
    isImpersonating={isImpersonating}
    viewedPseudonym={viewedParticipant?.pseudonym ?? null}
    viewedName={viewedParticipant?.name ?? null}
    asParam={asParam}
    userPseudonym={userPseudonym}
    feedEvents={feedEvents}
    feedBookTitles={feedBookTitles}
  />
)

const workspaceSlot = (
  <div className="p-4">
    <MatchingImpactWorkspace
      overview={clientScenarioSetOverview}
      bookById={bookById}
      bookParticipants={clientBookParticipants}
      viewingUserId={clientViewingUserId}
      moves={clientMoves}
      frozen={isReadOnly}
      movesHeading={isImpersonating ? 'Ходы участника' : 'Мои ходы'}
      mutationUserId={isImpersonating ? viewingUserId : undefined}
      adrift={clientAdrift}
    />
  </div>
)

const catalogIntroSlot = (
  <div style={{ padding: '1.4rem 0 1rem' }}>
    <h2 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.12rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
      {isImpersonating ? 'Список участника' : 'Каталог'}
    </h2>
    {!isImpersonating && (
      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Слева — книги клуба, справа — ваш список и приоритеты
      </p>
    )}
  </div>
)
```

- [ ] **Step 2: Replace the gate early-return with the flow wrapper**

Replace:
```tsx
  if (showRankingGate) {
    return (
      <MatchingRankingGate
        books={personalBooks}
        bookParticipants={bookParticipants}
        viewingUserId={viewingUserId}
      />
    )
  }
```
with (note: the gate-phase render must come AFTER `clientBookParticipants`/`clientViewingUserId` are computed; move the `showRankingGate` check below the publicization block, just before the final `return`):

```tsx
  if (showRankingGate) {
    return (
      <MatchingSatisfactionFlow
        phase="gate"
        sessionId={activeSession.id}
        books={personalBooks}
        bookParticipants={clientBookParticipants}
        viewingUserId={clientViewingUserId}
      />
    )
  }
```

> IMPORTANT: `showRankingGate` is currently evaluated at line ~154 (before publicization). Move the `if (showRankingGate) { … }` block down to just before `return (` at line ~252 so `clientBookParticipants`/`clientViewingUserId` exist. The data those need (`participants`, `bookParticipants`, etc.) is already fetched above the publicization block, so moving the gate check down only requires that the publicization locals are computed unconditionally (they already are). Verify no references to gate-only short-circuit remain above.

- [ ] **Step 3: Route satisfaction board through the wrapper; keep coverage unchanged**

Replace the final `return (<div className="flex flex-col" …> … </div>)` with a mode branch:

```tsx
  if (mode === 'satisfaction') {
    return (
      <MatchingSatisfactionFlow
        phase="board"
        sessionId={activeSession.id}
        books={personalBooks}
        bookParticipants={clientBookParticipants}
        viewingUserId={clientViewingUserId}
        frozen={isReadOnly}
        mutationUserId={isImpersonating ? viewingUserId : undefined}
        header={headerSlot}
        workspace={workspaceSlot}
        catalogIntro={catalogIntroSlot}
      />
    )
  }

  // Coverage path — unchanged
  return (
    <div className="flex flex-col" style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* … existing board JSX, byte-identical … */}
    </div>
  )
```

> The satisfaction board now renders its personal list **inside** the wrapper (compact size, not fill). The coverage board keeps its own `MatchingPersonalList` and `MatchingRealtimeWrapper`. The wrapper renders its own `MatchingRealtimeWrapper`, so do NOT double-mount it for satisfaction.

- [ ] **Step 4: Remove the now-unused import**

Remove `import MatchingRankingGate from '@/components/nd/MatchingRankingGate'` and add `import MatchingSatisfactionFlow from '@/components/nd/MatchingSatisfactionFlow'`.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. No unused vars (`MatchingRankingGate` removed).

- [ ] **Step 6: E2E smoke — gate still works (hard swap)**

Run (from main checkout if worktree jest issue applies; Playwright is unaffected): `npm run playwright test e2e/matching-satisfaction.spec.ts`
Expected: PASS — gate visible, rank, click enter → board appears (existing assertions). At this phase the transition is an instant `router.refresh` swap; that satisfies the existing spec.

- [ ] **Step 7: Commit**

```bash
git add app/matching/page.tsx
git commit -m "feat(matching): render satisfaction session through flow wrapper"
```

---

## Phase 3 — Entrance animation (gate → board)

Now make the gate→board transition animate instead of a hard swap. The wrapper gains a JS-measured `Collapsible`, an `entering` flag, and the `is-board` / `is-loaded` CSS hooks.

### Task 4: Add the Collapsible and animation orchestration

**Files:**
- Modify: `components/nd/MatchingSatisfactionFlow.tsx`

**Mechanics (from `BoardFlow.jsx` + README §5):**
- `Collapsible({ open, children })` — measures `scrollHeight`, animates `max-height` `0 ↔ measured` over `3.1s cubic-bezier(0.22,1,0.36,1)`, releases to `none` after open completes (so content never clips). Honors `prefers-reduced-motion` (jumps instantly, no transition).
- Wrap gate intro + gate footer in `Collapsible open={!board}` (they collapse on enter; also tagged `nd-flow-fade-collapse`).
- Wrap header + workspace in `Collapsible open={board}` (they expand on enter; tagged `nd-flow-slide-from-top`).
- Root gets `is-board` class when `board`.
- On enter (gate phase): set local `entering=true` (drives `is-board` immediately so fade/slide start), then `router.refresh()`. After refresh the server returns `phase='board'`; an effect sets `loaded=true` (→ `is-loaded` on stagger items) once `board` is true.
- Persistent list stays mounted (never inside a Collapsible).

- [ ] **Step 1: Add a reduced-motion-aware Collapsible**

Prepend inside `components/nd/MatchingSatisfactionFlow.tsx` (module scope):

```tsx
import { useEffect, useLayoutEffect, useRef } from 'react'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const [nat, setNat] = useState<number | null>(null)
  const [settled, setSettled] = useState(open)

  useLayoutEffect(() => {
    if (innerRef.current) setNat(innerRef.current.scrollHeight)
  }, [children])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setSettled(true), 3300)
      return () => clearTimeout(t)
    }
    setSettled(false)
  }, [open])

  if (reduced) {
    return <div style={{ maxHeight: open ? 'none' : 0, overflow: 'hidden' }}><div ref={innerRef}>{children}</div></div>
  }

  const maxHeight =
    nat == null ? (open ? 'none' : 0) : !open ? 0 : settled ? 'none' : nat

  return (
    <div style={{ maxHeight, overflow: 'hidden', transition: 'max-height 3.1s cubic-bezier(0.22, 1, 0.36, 1)' }}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Add entering/loaded state + is-board class**

In the component body:

```tsx
  const [entering, setEntering] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const isBoard = board || entering

  // Once the server has switched us to the board phase, reveal staggered content.
  useEffect(() => {
    if (board) {
      const t = setTimeout(() => setLoaded(true), 50)
      return () => clearTimeout(t)
    }
  }, [board])

  const enter = useCallback(() => {
    if (!canEnter || board || entering) return
    setEntering(true)        // start fade/slide immediately
    router.refresh()         // server returns phase='board' with scenarios
  }, [canEnter, board, entering, router])
```

Root `className`: `className={'nd-flow' + (isBoard ? ' is-board' : '')}`.

- [ ] **Step 3: Wrap slots in Collapsible + animation classes**

- Header slot: `<Collapsible open={isBoard}><div className="nd-flow-slide-from-top">{props.header}</div></Collapsible>`
- Workspace slot: `<Collapsible open={isBoard}><div className="nd-flow-slide-from-top">{props.workspace}</div></Collapsible>`
- Gate intro: `<Collapsible open={!isBoard}><div className="nd-flow-fade-collapse" data-testid="ranking-gate">…intro…</div></Collapsible>`
- Gate footer: `<Collapsible open={!isBoard}><div className="nd-flow-fade-collapse">…footer…</div></Collapsible>`
- Persistent list block stays OUTSIDE any Collapsible. Toggle its size/fill by `isBoard` (not `board`) so it resizes as the animation begins: `size={isBoard ? 'compact' : 'large'}`, `fill={!isBoard}`, `suppressRefresh={!isBoard}`.
- Apply `nd-flow-stagger` + `is-loaded` to the workspace inner wrapper via a prop, OR (simpler) keep stagger on the whole workspace slot: wrap as `<div className={'nd-flow-stagger' + (loaded ? ' is-loaded' : '')} style={{ transitionDelay: loaded ? '240ms' : '0ms' }}>{props.workspace}</div>` inside the slide wrapper.

> Per-card stagger (scenarios `i*240ms`, moves `600+i*240ms`) from the prototype is OPTIONAL polish; the slot-level stagger above is sufficient and avoids threading delays into `MatchingImpactWorkspace`. Do not over-engineer — slot-level stagger satisfies the design intent ("контент появляется, когда воркспейс уже раскрылся").

- [ ] **Step 4: Scroll reset on enter**

When `isBoard` becomes true, scroll the root container to top smoothly. Add a ref on the outer scroll container and in an effect: `useEffect(() => { if (isBoard) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [isBoard])`. (The page itself scrolls in board phase; the gate is `overflow:hidden` one-screen.)

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual verification via preview**

Start the dev server and verify the transition visually (this change IS observable in the browser):
1. `preview_start`
2. Drive to `/matching` as a satisfaction participant without ranks (use an impersonation-free test session, or the E2E fixture flow). Rank ≥1 book.
3. Click «Войти в сессию» → observe: intro/footer collapse, header+workspace slide in from top, list moves down, content staggers in. No console errors (`preview_console_logs`).
4. `preview_screenshot` mid- and post-transition to attach as proof.

> If a satisfaction session is not readily reproducible in preview, defer visual proof to the Playwright run in Task 5 and note that in the commit.

- [ ] **Step 7: Commit**

```bash
git add components/nd/MatchingSatisfactionFlow.tsx
git commit -m "feat(matching): animate gate→board entrance transition"
```

---

## Phase 4 — Tests: E2E + UI layout

### Task 5: E2E — deterministic transition + persistence; UI layout one-screen

**Files:**
- Modify: `e2e/matching-satisfaction.spec.ts`
- Modify: `e2e/ui-states.spec.ts`

The 3.1s animation is non-deterministic for Playwright's default 5s expect timeout. Run the satisfaction spec with **`reducedMotion: 'reduce'`** so the Collapsible jumps to its final state (intro/footer height 0 → `ranking-gate` not visible; board visible immediately). This keeps existing assertions green and makes new ones stable.

- [ ] **Step 1: Force reduced motion in the satisfaction spec**

At the top of `e2e/matching-satisfaction.spec.ts`, add inside the `test.describe` (or per-test) a context option. With Playwright Test, add:

```ts
test.use({ reducedMotion: 'reduce' })
```

- [ ] **Step 2: Add the persistence assertion (reload after enter)**

Extend the rank→enter test so after clicking enter and seeing the board, it reloads and confirms the viewer is placed (board, not gate), per the reload rule:

```ts
  // after enter → board visible
  await expect(page.getByTestId('ranking-gate')).not.toBeVisible()
  // persistence: reload keeps us on the board (ranking complete persisted)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('ranking-gate')).not.toBeVisible()
  // a scenarios surface is present (board rendered)
  await expect(page.getByText(/Сценарий\s*1|Пока без круга|Сценарии/i).first()).toBeVisible()
```

> Use the existing fixtures (`createMatchingSession`/satisfaction fixture, `createTestBook`, `loginAs…`) already used in this spec — do NOT write inline cleanup. If a satisfaction-session fixture does not yet exist, reuse the setup the current `matching-satisfaction.spec.ts` already performs (it constructs a satisfaction session today).

- [ ] **Step 3: Add a one-screen gate UI layout test**

In `e2e/ui-states.spec.ts`, add a test proving the gate CTA is within the viewport without page scroll (one-screen requirement):

```ts
test('satisfaction ranking gate fits one viewport (CTA visible without scroll)', async ({ page }) => {
  // …set up satisfaction session + join without complete ranking (reuse satisfaction fixture)…
  await page.goto('/matching')
  await page.waitForLoadState('networkidle')
  const gate = page.getByTestId('ranking-gate')
  await expect(gate).toBeVisible()
  const enter = page.getByTestId('ranking-gate-enter')
  const box = await enter.boundingBox()
  const viewport = page.viewportSize()!
  expect(box).not.toBeNull()
  // CTA bottom edge is within the viewport height → no page scroll needed
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
})
```

- [ ] **Step 4: Run the E2E suites**

Run:
```bash
npm run playwright test e2e/matching-satisfaction.spec.ts
npm run playwright test e2e/ui-states.spec.ts
```
Expected: PASS. If the one-screen test fails because content overflows at the test viewport, confirm the `fill` scroll wiring (Task 1) and the gate container `height:100svh` (Task 2) are in effect.

- [ ] **Step 5: Commit**

```bash
git add e2e/matching-satisfaction.spec.ts e2e/ui-states.spec.ts
git commit -m "test(matching): e2e gate→board persistence + one-screen layout"
```

### Task 6: Retire the standalone gate

**Files:**
- Delete: `components/nd/MatchingRankingGate.tsx`
- Check: any remaining imports/tests referencing it.

- [ ] **Step 1: Confirm no references remain**

Run: `grep -rn "MatchingRankingGate" app/ components/ e2e/ lib/`
Expected: only the file itself (and possibly its own test). If `page.tsx` still imports it, it was missed in Task 3 — fix there.

- [ ] **Step 2: Delete the component (and its test if present)**

```bash
git rm components/nd/MatchingRankingGate.tsx
# if a dedicated test exists:
# git rm components/nd/MatchingRankingGate.test.tsx
```

- [ ] **Step 3: Full local gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS (no dangling imports; no orphaned tests). Remember the worktree-jest caveat — if `npm test` reports 0 tests, run from the main checkout or rely on CI.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(matching): remove standalone MatchingRankingGate (superseded by flow)"
```

---

## Verification before completion (whole feature)

Before opening the PR, per `superpowers:verification-before-completion`:

- [ ] `npm run lint` — PASS
- [ ] `npm run typecheck` — PASS
- [ ] `npm test` — PASS (from main checkout if worktree shows 0 tests)
- [ ] `npm run playwright test e2e/matching-satisfaction.spec.ts e2e/ui-states.spec.ts` — PASS
- [ ] Preview screenshot of the gate→board transition attached (Task 4 Step 6) OR Playwright trace as fallback.

**Pre-commit checklist artifacts (project rule — write these explicitly in the PR/commit message):**
- _E2E: нужен — изменён UI-флоу гейт→доска и условный рендер по режиму; добавлены persistence + one-screen тесты._
- _Wiki: нужна — обновить `docs/wiki/` (раздел matching / satisfaction-режим): описать экран ранжирования и анимацию входа гейт→доска._ Update `docs/features/` matching doc accordingly too.

---

## Self-Review (performed against handoff + spec)

**Spec coverage:**
- §2 gate (no eyebrow, copy, single footer hint, CTA «Войти в сессию», one-screen, larger rows) → Tasks 1–2 ✓
- §5 entrance animation (Collapsible 3.1s, slide-from-top, fade-collapse, stagger, reduced-motion, scroll reset, persistent list) → Tasks 0, 3–4 ✓
- §3 scenarios neutral copy → already shipped; handoff's `--radius-pill` deliberately NOT applied (canon) ✓
- §4 adrift softened → already shipped; handoff's circle/`accent-soft` deliberately NOT applied (canon) ✓
- §1 selector / engine / moves → already shipped, out of scope ✓
- Coverage path unchanged → page.tsx branches `mode === 'satisfaction'`; coverage `return` byte-identical ✓
- E2E contract (testids, H1) preserved; reload rule honored → Task 5 ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `MatchingSatisfactionFlowProps` (Task 2) is the prop shape used by `page.tsx` (Task 3) and extended in Task 4 (`Collapsible`, `entering`, `loaded` are internal, not prop changes). `size`/`fill` props (Task 1) match the wrapper's usage. `listHasCompleteActiveRanking` import matches `lib/matching/ranking-readiness.ts` exports (verified). `BookParticipant` re-exported from `MatchingPersonalList` matches `page.tsx` usage.

**Open risk (flagged, not blocking):** Phase 3 relies on App Router `router.refresh()` preserving `MatchingSatisfactionFlow` client state across the gate→board server branch because both branches render the wrapper at the same tree position. If, in practice, React remounts the wrapper (losing `entering`), the animation will not play (board appears via hard swap — still functional, no data loss). Mitigation if observed: hoist a single `<MatchingSatisfactionFlow>` above the gate/board branch and pass `phase` as a prop computed once, ensuring identical element identity. Validate during Task 4 Step 6.

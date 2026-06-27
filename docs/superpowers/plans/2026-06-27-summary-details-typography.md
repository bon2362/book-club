# Summary Details Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical-looking summary disclosure and left-border quotes with the approved editorial spine and hanging-quote treatment.

**Architecture:** Keep the existing safe Markdown parser and native `<details>/<summary>` semantics. Add semantic class names plus an absolutely positioned rail child whose hit area spans the full details block, and define token-only styles in `app/globals.css`; no client state or arbitrary HTML support is introduced.

**Tech Stack:** Next.js 14, React, react-markdown, CSS, Jest/Testing Library, Playwright.

---

### Task 1: Renderer Structure And Quote Semantics

**Files:**
- Modify: `components/nd/SummaryMarkdown.test.tsx`
- Modify: `components/nd/SummaryMarkdown.tsx`

- [ ] Add a failing test that expects `nd-summary-details`, `nd-summary-details__rail`, `nd-summary-details__body`, no `+`/`−`, and a decorative `nd-summary-blockquote__mark` for `> Цитата`.
- [ ] Run `npm test -- SummaryMarkdown.test.tsx --runInBand`; verify failure because the structure does not exist.
- [ ] Add the rail/title/body markup to the existing details renderer and hanging quote markup to the ReactMarkdown component map.
- [ ] Run the focused test again and verify all assertions pass.

Expected details structure:

```tsx
<details className="nd-summary-details" open={openAttr !== undefined}>
  <summary className="nd-summary-details__summary">
    <span className="nd-summary-details__rail" aria-hidden="true" />
    <span className="nd-summary-details__title">{summary}</span>
  </summary>
  <div className="nd-summary-details__body">...</div>
</details>
```

Expected quote structure:

```tsx
<blockquote className="nd-summary-blockquote">
  <span className="nd-summary-blockquote__mark" aria-hidden="true">“</span>
  {children}
</blockquote>
```

### Task 2: Token-Based Editorial Styling

**Files:**
- Modify: `app/globals.css`

- [ ] Add the approved details and quote classes using only `var(--…)` colors and the existing serif token.
- [ ] Make the rail hit area 22 px wide while its visible pseudo-line is 2 px.
- [ ] On rail-only hover, change the pseudo-line to `var(--accent-hover)` and 5 px without changing layout.
- [ ] Remove the native summary marker, provide `:focus-visible`, and disable reveal motion under `prefers-reduced-motion`.
- [ ] Run `npm test -- SummaryMarkdown.test.tsx --runInBand`, `npm run lint`, and `npm run typecheck`.

### Task 3: Layout Regression Coverage

**Files:**
- Modify: `e2e/ui-states.spec.ts`

- [ ] Add a summary preview setup using existing isolated fixtures and an open details block containing body text and a quote.
- [ ] Assert with `boundingBox()` that the rail spans the details height, its hit area is at least 20 px wide, and body text is offset from the rail.
- [ ] Assert computed `::before` width changes from 2 px to 5 px only when the rail is hovered.
- [ ] Click body text and verify the details remains open; click the rail and verify it closes.
- [ ] Run `npm run test:e2e e2e/ui-states.spec.ts` when `.env.test.local` is available; otherwise document the missing local environment and rely on the nightly/manual workflow.

### Task 4: User And Technical Documentation

**Files:**
- Modify: `docs/features/book-summaries.md`
- Modify: `docs/wiki/Book-Summaries.md`

- [ ] Explain that `<summary>` is an author-defined heading, the accent line identifies and toggles the detailed layer, and quotes use a hanging mark rather than a competing vertical rule.
- [ ] Run a placeholder/consistency scan across the spec, plan, and docs.

### Task 5: Verification And Delivery

**Files:** all changed files.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --runInBand`.
- [ ] Run `SKIP_ENV_VALIDATION=true DATABASE_URL='postgresql://dummy:dummy@dummy/dummy' npm run build`.
- [ ] Review `git diff --check` and `git status --short --branch`.
- [ ] Commit without `--no-verify`, push `codex/summary-details-typography`, open a PR, enable squash auto-merge, and follow CI through merge and production deployment.


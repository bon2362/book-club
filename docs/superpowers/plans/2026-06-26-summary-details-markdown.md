# Summary Details Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add polished `h3`/`h4` rendering and portable `<details><summary>...</summary>...</details>` collapsible sections for book summaries.

**Architecture:** Keep public summary content stored as Markdown. Render only the safe details pattern ourselves before handing normal Markdown fragments to `react-markdown`; do not enable arbitrary raw HTML.

**Tech Stack:** Next.js 14, React, Jest, Testing Library, `react-markdown`.

---

### Task 1: Markdown Renderer

**Files:**
- Modify: `components/nd/SummaryMarkdown.tsx`
- Test: `components/nd/SummaryMarkdown.test.tsx`

- [ ] Add failing tests for `###`, `####`, closed details, open details, Markdown inside details, and raw `<script>` safety.
- [ ] Run `npm test -- SummaryMarkdown.test.tsx --runInBand` and confirm the new tests fail before implementation.
- [ ] Implement a small details-block parser that recognizes `<details>`, `<details open>`, a single `<summary>Title</summary>`, and `</details>`.
- [ ] Render details blocks as React `<details open={...}>` with styled `<summary>` and recursively rendered body Markdown.
- [ ] Style `h3` and `h4` in the existing Markdown component map.
- [ ] Run `npm test -- SummaryMarkdown.test.tsx --runInBand` and confirm green.

### Task 2: Toolbar And Docs

**Files:**
- Modify: `components/nd/MarkdownToolbar.tsx`
- Test: `components/nd/MarkdownToolbar.test.tsx`
- Modify: `docs/features/book-summaries.md`

- [ ] Add a failing toolbar test proving the collapsible-section button inserts portable `<details>` syntax.
- [ ] Run `npm test -- MarkdownToolbar.test.tsx --runInBand` and confirm it fails.
- [ ] Add toolbar button “Раздел” that inserts a closed details template; authors can add `open` manually.
- [ ] Update docs with the supported details syntax and heading guidance.
- [ ] Run focused tests, lint, typecheck, unit tests, and build before commit.

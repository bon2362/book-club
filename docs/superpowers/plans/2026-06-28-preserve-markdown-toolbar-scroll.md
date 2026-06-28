# Preserve Markdown Toolbar Selection and Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the summary editor at the same page and textarea position when a Markdown toolbar action formats selected text.

**Architecture:** `MarkdownToolbar` will capture selection and textarea viewport state before changing the controlled value, then restore them after React renders. Pointer-down on toolbar buttons will not steal textarea focus, and focus restoration will use the browser's `preventScroll` option.

**Tech Stack:** React 18, TypeScript, Jest/Testing Library, Playwright, Next.js 14.

---

### Task 1: Lock the regression with component tests

**Files:**
- Modify: `components/nd/MarkdownToolbar.test.tsx`

- [ ] **Step 1: Add failing focus and viewport restoration tests**

Add tests using fake timers that select `важный`, set non-zero `scrollTop` and `scrollLeft`, click `Жирный`, and assert:

```ts
expect(textarea.focus).toHaveBeenCalledWith({ preventScroll: true })
expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('важный')
expect(textarea.scrollTop).toBe(240)
expect(textarea.scrollLeft).toBe(12)
```

Add a separate pointer-focus assertion:

```ts
expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Жирный' }))).toBe(false)
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx jest --runInBand --runTestsByPath components/nd/MarkdownToolbar.test.tsx
```

Expected: focus restoration fails because `focus()` receives no `preventScroll`, and pointer-down is not cancelled.

### Task 2: Restore selection without moving the viewport

**Files:**
- Modify: `components/nd/MarkdownToolbar.tsx`
- Test: `components/nd/MarkdownToolbar.test.tsx`

- [ ] **Step 1: Add one shared restoration helper**

Capture a viewport object before every toolbar value change:

```ts
interface TextareaViewport {
  scrollTop: number
  scrollLeft: number
}
```

Restore after the controlled update:

```ts
function restoreTextarea(
  textareaRef: RefObject<HTMLTextAreaElement>,
  start: number,
  end: number,
  viewport: TextareaViewport,
) {
  window.setTimeout(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(start, end)
    textarea.scrollTop = viewport.scrollTop
    textarea.scrollLeft = viewport.scrollLeft
  }, 0)
}
```

- [ ] **Step 2: Apply the helper to direct formatting and Wikipedia insertion**

Extend the saved Wikipedia selection with viewport offsets, and replace both existing timer blocks with the shared helper. Add this to every toolbar button, including Wikipedia:

```tsx
onMouseDown={event => event.preventDefault()}
```

- [ ] **Step 3: Run the component tests and verify GREEN**

Run:

```bash
npx jest --runInBand --runTestsByPath components/nd/MarkdownToolbar.test.tsx
```

Expected: all toolbar tests pass.

### Task 3: Cover the real browser scroll behavior

**Files:**
- Modify: `e2e/ui-states.spec.ts`

- [ ] **Step 1: Add a long-document editor test**

In the existing `Summary editor layout` describe block, create an isolated test book and read-status user, open a draft, and save a body with enough lines to scroll. In the browser:

```ts
await textarea.evaluate((element: HTMLTextAreaElement) => {
  const marker = 'выделенный фрагмент'
  const start = element.value.indexOf(marker)
  element.focus()
  element.setSelectionRange(start, start + marker.length)
  element.scrollTop = 300
})
await page.evaluate(() => window.scrollTo(0, 700))
```

Record `window.scrollY` and `textarea.scrollTop`, click `Жирный`, then assert focus, selected text, and both offsets are unchanged within one pixel.

- [ ] **Step 2: Run the focused browser test**

Run against the isolated E2E Neon branch:

```bash
npm run test:e2e e2e/ui-states.spec.ts --grep "форматирование не меняет прокрутку"
```

Expected: PASS.

- [ ] **Step 3: Run the complete required UI suite**

Run:

```bash
npm run test:e2e e2e/ui-states.spec.ts
```

Expected: all UI-state tests pass.

### Task 4: Verify and deliver through PR

**Files:** all changed files

- [ ] **Step 1: Run full local verification**

```bash
npm run lint && npm run typecheck && npm test -- --runInBand && npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Assess release artifacts and commit**

Report before committing:

- `E2E: нужен` because this fixes browser focus and scroll behavior in an existing editor flow.
- `Wiki: не нужна` because APIs, data, routing, and the workflow are unchanged.

Commit without bypassing hooks:

```bash
git add components/nd/MarkdownToolbar.tsx components/nd/MarkdownToolbar.test.tsx e2e/ui-states.spec.ts docs/superpowers/plans/2026-06-28-preserve-markdown-toolbar-scroll.md
git commit -m "fix: preserve summary editor position when formatting"
```

- [ ] **Step 3: Push, create PR, enable auto-merge, and monitor**

Push `codex/preserve-toolbar-scroll`, create a PR, enable squash auto-merge, inspect `mergeStateStatus`, and keep fixing the same branch until GitHub CI is green and the PR is merged.

- [ ] **Step 4: Verify production deployment**

Wait for the Vercel status on the merge commit to become `success`, then verify the production site responds successfully.

# Подборки — PR 5: ссылка «Подборки» в шапке

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ссылка на `/collections` в общей шапке сайта — для всех посетителей, независимо от блока на главной.

**Architecture:** Одна правка в `components/nd/Header.tsx` по макету дизайнера. Шапка уже рендерится на главной (`BooksPage`), в админке (`AdminPanel`) и на страницах подборок (PR 2). Страницы ленты времени, саммари и матчинга общую шапку не используют — там ссылки не будет; это не часть задачи.

**Tech Stack:** React, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md` → «Ключевые решения» (ссылка есть всегда) и «Дизайн → Ссылка «Подборки» в шапке — ждёт макета».

## Global Constraints

См. `00-overview.md`. Ссылка видна гостям и вошедшим, на десктопе и телефоне; не зависит от `collections_home_block_enabled`.

## Блокер

- [ ] **Макет от дизайнера получен и согласован владельцем.** Без него PR не начинать: место и вид ссылки на десктопе и телефоне решает дизайнер. Если макета нет — остановиться и сообщить владельцу.

## Подготовка

- [ ] PR 2 смержен (страницы подборок существуют).
- [ ] Worktree `../book-club-collections-5`, ветка `feat/collections-header-link` от свежего `origin/main`; симлинки как в PR 2.

---

### Task 1: Ссылка в шапке

**Files:**
- Modify: `components/nd/Header.tsx`
- Test: `components/nd/Header.test.tsx`

- [ ] **Step 1: Тест** — дописать в `components/nd/Header.test.tsx`, используя принятый в файле рендер и моки:

```tsx
it('ссылка «Подборки» видна гостю и ведёт на /collections', () => {
  mockSession.mockReturnValue({ data: null }) // как в соседних тестах файла
  render(<Header onSignIn={jest.fn()} />)
  const link = screen.getByRole('link', { name: 'Подборки' })
  expect(link).toHaveAttribute('href', '/collections')
})

it('ссылка «Подборки» видна вошедшему', () => {
  mockSession.mockReturnValue({ data: { user: { id: 'u1', name: 'Аня' } } })
  render(<Header onEditProfile={jest.fn()} displayName="Аня" />)
  expect(screen.getByRole('link', { name: 'Подборки' })).toBeInTheDocument()
})

it('клик уходит в аналитику с источником «шапка»', () => {
  mockSession.mockReturnValue({ data: null })
  render(<Header onSignIn={jest.fn()} />)
  fireEvent.click(screen.getByRole('link', { name: 'Подборки' }))
  expect(track).toHaveBeenCalledWith('collections_opened', { source: 'header' })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация по макету.** Базовая форма ссылки — текст-ссылка хрома `.p-link`; место, размер, поведение на телефоне и активное состояние на `/collections*` — строго по макету:

```tsx
<Link
  href="/collections"
  prefetch={false}
  className="p-link"
  onClick={() => track('collections_opened', { source: 'header' })}
>
  Подборки
</Link>
```

Если макет требует отметить активный раздел — используй `usePathname()` из `next/navigation` и в `Header.test.tsx` добавь мок `jest.mock('next/navigation', () => ({ usePathname: () => '/' }))`; проверь, что тесты, которые мокают `Header` целиком (`BooksPage.*.test.tsx`), от этого не зависят.

Цвета и шрифты — только токены; при переполнении на узком экране проверь, что шапка не переносится в две строки (если макет этого не предусматривает).

- [ ] **Step 4: Прогон** `npx jest components/nd/Header` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/Header.tsx components/nd/Header.test.tsx
git commit -m "feat(collections): ссылка «Подборки» в шапке сайта"
```

---

### Task 2: E2E, документация, PR

**Files:**
- Modify: `e2e/shell-layout.spec.ts`, `docs/features/collections.md`, `docs/wiki/Book-Collections.md`

- [ ] **Step 1: Layout-тест** в `e2e/shell-layout.spec.ts` (доменная layout-спека шапки):

```ts
test('ссылка «Подборки» в шапке видна на десктопе и телефоне и ведёт на /collections', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const link = page.locator('header').getByRole('link', { name: 'Подборки' })
    await expect(link).toBeVisible()
    const box = (await link.boundingBox())!
    // ссылка целиком в кадре по горизонтали: 0 ≤ x и x + width ≤ ширина окна
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  }
  await page.locator('header').getByRole('link', { name: 'Подборки' }).click()
  await expect(page).toHaveURL(/\/collections$/)
})
```

Добавь проверку места по макету (например, «ссылка левее кнопки входа»), если макет её задаёт.

- [ ] **Step 2: Прогон** `npm run test:e2e:focused -- e2e/shell-layout.spec.ts --grep "Подборки"`

- [ ] **Step 3: Документация** — в `docs/wiki/Book-Collections.md` и `docs/features/collections.md`: где ссылка, что она есть всегда и на каких страницах есть общая шапка.

- [ ] **Step 4: Проверка, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
```

В ответе:
- «E2E: нужен — CSS-поведение и навигация шапки на двух ширинах; прогнан focused `e2e/shell-layout.spec.ts`».
- «Wiki: нужна — навигация сайта (`docs/wiki/Book-Collections.md`)».

```bash
git add e2e/shell-layout.spec.ts docs
git commit -m "test(collections): ссылка в шапке на десктопе и телефоне"
git push -u origin feat/collections-header-link
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable
```

После мержа — сообщить владельцу, что фича подборок выкачена полностью, и что `../book-club-collections-5` можно удалить.

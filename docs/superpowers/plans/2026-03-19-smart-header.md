# Smart Header (Hide on Scroll) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Шапка и строка фильтров скрываются при скролле вниз, появляются при скролле вверх.

**Architecture:** `ScrollHideContext` с одним passive scroll listener на уровне layout. Шапка применяет `transform` на inner wrapper (не на sticky-элемент). Фильтры становятся sticky и синхронно применяют такой же transform.

**Tech Stack:** Next.js 14, React context, CSS transform/transition, ResizeObserver

**Spec:** `docs/superpowers/specs/2026-03-19-smart-header-design.md`

---

## Chunk 1: ScrollHideContext

### Task 1: Создать `lib/scroll-hide-context.tsx`

**Files:**
- Create: `lib/scroll-hide-context.tsx`
- Create: `__tests__/scroll-hide-context.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
// __tests__/scroll-hide-context.test.ts
import { renderHook, act } from '@testing-library/react'
import { ScrollHideProvider, useScrollHide } from '@/lib/scroll-hide-context'

describe('useScrollHide', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  function fireScroll(y: number) {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: y })
    window.dispatchEvent(new Event('scroll'))
  }

  it('starts as not hidden', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    expect(result.current.isHidden).toBe(false)
  })

  it('hides when scrolling down past threshold', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) })
    expect(result.current.isHidden).toBe(true)
  })

  it('shows when scrolling up', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) })
    act(() => { fireScroll(50) })
    expect(result.current.isHidden).toBe(false)
  })

  it('does not hide when scrollY below threshold (10-60px)', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(30) })
    expect(result.current.isHidden).toBe(false)
  })

  it('forces visible when at top (scrollY < 10)', () => {
    const { result } = renderHook(() => useScrollHide(), { wrapper: ScrollHideProvider })
    act(() => { fireScroll(100) }) // hide
    act(() => { fireScroll(5) })   // back to top
    expect(result.current.isHidden).toBe(false)
  })
})
```

- [ ] **Step 2: Убедиться что тест падает**

```bash
cd /workspace && npx jest scroll-hide-context --no-coverage 2>&1 | tail -20
```
Ожидаем: Cannot find module `@/lib/scroll-hide-context`

- [ ] **Step 3: Реализовать `lib/scroll-hide-context.tsx`**

```tsx
'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

const HIDE_THRESHOLD = 60  // px — начинаем скрывать после этого
const TOP_THRESHOLD = 10   // px — у самого верха всегда показываем

interface ScrollHideContextValue {
  isHidden: boolean
}

const ScrollHideContext = createContext<ScrollHideContextValue>({ isHidden: false })

export function ScrollHideProvider({ children }: { children: React.ReactNode }) {
  const [isHidden, setIsHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY

      if (y < TOP_THRESHOLD) {
        setIsHidden(false)
        lastScrollY.current = y
        return
      }

      const scrollingDown = y > lastScrollY.current

      if (scrollingDown && y > HIDE_THRESHOLD) {
        setIsHidden(true)
      } else if (!scrollingDown) {
        setIsHidden(false)
      }
      // scrollY между TOP_THRESHOLD и HIDE_THRESHOLD при скролле вниз — без изменений

      lastScrollY.current = y
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <ScrollHideContext.Provider value={{ isHidden }}>
      {children}
    </ScrollHideContext.Provider>
  )
}

export function useScrollHide() {
  return useContext(ScrollHideContext)
}
```

- [ ] **Step 4: Прогнать тест**

```bash
cd /workspace && npx jest scroll-hide-context --no-coverage 2>&1 | tail -20
```
Ожидаем: 5 passed

- [ ] **Step 5: lint + typecheck**

```bash
cd /workspace && npm run lint && npm run typecheck
```

- [ ] **Step 6: Коммит**

```bash
cd /workspace && git add lib/scroll-hide-context.tsx __tests__/scroll-hide-context.test.ts && git commit -m "feat: add ScrollHideContext for smart header scroll behavior"
```

---

## Chunk 2: Layout + Header

### Task 2: Добавить `ScrollHideProvider` в `app/layout.tsx`

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Импортировать и обернуть `{children}`**

В `app/layout.tsx` добавить импорт и обернуть `{children}` провайдером:

```tsx
import { ScrollHideProvider } from '@/lib/scroll-hide-context'

// В теле <body>:
<ScrollHideProvider>
  {children}
</ScrollHideProvider>
```

`layout.tsx` остаётся Server Component — добавление Client Component как wrapper корректно в Next.js 14.

- [ ] **Step 2: lint + typecheck**

```bash
cd /workspace && npm run lint && npm run typecheck
```

---

### Task 3: Обновить `Header.tsx` — inner wrapper + transform + ResizeObserver

**Files:**
- Modify: `components/nd/Header.tsx`

- [ ] **Step 1: Обновить импорты в `Header.tsx`**

Заменить строку импорта React:
```tsx
// было:
import { useState } from 'react'
// стало:
import { useState, useRef, useEffect } from 'react'
```

Добавить импорт хука (после существующих импортов):
```tsx
import { useScrollHide } from '@/lib/scroll-hide-context'
```

- [ ] **Step 2: Добавить хуки и ref в тело компонента**

После строки `const [whatIsThisHovered, setWhatIsThisHovered] = useState(false)` добавить:
```tsx
const { isHidden } = useScrollHide()
const headerRef = useRef<HTMLElement>(null)

useEffect(() => {
  const el = headerRef.current
  if (!el) return
  const observer = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty(
      '--header-height',
      `${entry.contentRect.height}px`
    )
  })
  observer.observe(el)
  return () => observer.disconnect()
}, [])
```

- [ ] **Step 3: Добавить `ref` и `overflow: hidden` на `<header>`**

Использовать Edit, заменить открывающий тег `<header`:
```tsx
// было:
    <header
      style={{
        borderBottom: '2px solid #000',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
// стало:
    <header
      ref={headerRef}
      style={{
        borderBottom: '2px solid #000',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
```

- [ ] **Step 4: Обернуть inner content div в анимирующий wrapper**

Использовать Edit. Найти строку сразу после `<header ...>`:
```tsx
      <div
        style={{
          maxWidth: '1200px',
```
И добавить перед ней wrapper div, а после закрывающего `</header>` добавить его закрытие.

Точный edit — добавить wrapper между `<header ...>` и content div:
```tsx
// добавить сразу после открывающего тега <header>:
      <div
        style={{
          transform: isHidden ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 0.25s ease',
        }}
      >
// добавить перед </header>:
      </div>
```

Итоговая структура (content JSX внутри не меняется):
```tsx
<header ref={headerRef} style={{ ...existing + overflow: 'hidden' }}>
  <div style={{ transform: ..., transition: ... }}>   {/* NEW wrapper */}
    <div style={{ maxWidth: '1200px', ... }}>          {/* existing content div */}
      {/* ...всё существующее содержимое без изменений... */}
    </div>
  </div>                                               {/* NEW wrapper close */}
</header>
```

- [ ] **Step 5: lint + typecheck**

```bash
cd /workspace && npm run lint && npm run typecheck
```

- [ ] **Step 6: Коммит**

```bash
cd /workspace && git add app/layout.tsx components/nd/Header.tsx && git commit -m "feat: hide header on scroll down, show on scroll up"
```

---

## Chunk 3: Filter bar + финал

### Task 4: Сделать фильтры sticky с синхронным transform

**Files:**
- Modify: `components/nd/BooksPage.tsx`

Фильтры в `BooksPage.tsx` — внешний div строки 260:
```tsx
<div style={{ borderBottom: '1px solid #E5E5E5', background: '#fff' }}>
```

- [ ] **Step 1: Добавить `useScrollHide` и применить к внешнему div фильтров**

Добавить импорт в начало файла:
```tsx
import { useScrollHide } from '@/lib/scroll-hide-context'
```

В теле компонента (рядом с другими хуками):
```tsx
const { isHidden } = useScrollHide()
```

Изменить внешний div фильтров (строка 260):
```tsx
<div
  style={{
    borderBottom: '1px solid #E5E5E5',
    background: '#fff',
    position: 'sticky',
    top: 'var(--header-height, 57px)',
    transform: isHidden
      ? 'translateY(calc(-1 * var(--header-height, 57px)))'
      : 'translateY(0)',
    transition: 'transform 0.25s ease',
    zIndex: 90,
  }}
>
```

- [ ] **Step 2: lint + typecheck**

```bash
cd /workspace && npm run lint && npm run typecheck
```

- [ ] **Step 3: Прогнать все тесты**

```bash
cd /workspace && npm test -- --no-coverage 2>&1 | tail -30
```
Ожидаем: все тесты зелёные.

- [ ] **Step 4: Коммит**

```bash
cd /workspace && git add components/nd/BooksPage.tsx && git commit -m "feat: make filter bar sticky, hide with header on scroll down"
```

### Task 5: Обновить бэклог и пуш

- [ ] **Step 1: Переместить #69 в раздел «Выполнено» в `docs/BACKLOG.md`**

Удалить из раздела «UI/UX» пункт:
```markdown
#### 69. Скрытие шапки при скролле вниз · `XS`
...
```

Добавить в начало раздела «Выполнено»:
```markdown
### 69. Скрытие шапки при скролле вниз

`ScrollHideContext` с одним passive scroll listener на уровне layout. Шапка (`overflow: hidden` + inner wrapper с `transform: translateY(-100%)`) и строка фильтров (`position: sticky` + синхронный `translateY`) прячутся при скролле вниз >60px, появляются при скролле вверх. CSS-переменная `--header-height` устанавливается через `ResizeObserver`.
```

- [ ] **Step 2: Коммит бэклога**

```bash
cd /workspace && git add docs/BACKLOG.md && git commit -m "docs(backlog): выполнен #69 (умная шапка)"
```

- [ ] **Step 3: Push**

```bash
cd /workspace && git push
```

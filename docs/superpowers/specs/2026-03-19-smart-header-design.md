# Дизайн: «Умная шапка» — скрытие при скролле вниз (#69)

## Цель

При прокрутке вниз шапка и строка фильтров уезжают за верхний край экрана. При прокрутке вверх — появляются обратно. Стандартный паттерн «умной шапки» через scroll listener + CSS transition.

---

## Архитектура

### Новые файлы

**`lib/scroll-hide-context.tsx`** (`'use client'` обязателен)

React-контекст с одним `scroll`-listener на всё приложение:
- Экспортирует `ScrollHideProvider` и хук `useScrollHide()`
- Хранит `isHidden: boolean` в `useState`
- Listener: `window.addEventListener('scroll', handler, { passive: true })`
- Сравнивает `scrollY` с `lastScrollY.current` для определения направления

`ScrollHideProvider` — Client Component. Добавление его в `app/layout.tsx` (Server Component) корректно в Next.js 14: Server Component может рендерить Client Component как дочерний элемент. `layout.tsx` при этом сам не становится клиентским.

### Изменяемые файлы

- **`app/layout.tsx`** — оборачивает `{children}` в `<ScrollHideProvider>`
- **`components/nd/Header.tsx`** — inner wrapper получает transform при `isHidden`
- **`components/nd/BooksPage.tsx`** — внешний div строки фильтров становится sticky + синхронный transform

---

## Поведение скролла

| Условие | Действие |
|---|---|
| scroll down + `scrollY > 60px` | `isHidden = true` |
| scroll up (любой) | `isHidden = false` |
| `scrollY < 10px` | `isHidden = false` (всегда виден у самого верха) |
| scroll down, `scrollY` между 10px и 60px | без изменений (предотвращает мигание вблизи верха) |

Порог 60px ≈ высота шапки.

---

## Анимация

### Шапка (`Header.tsx`)

**Важно:** `transform` нельзя применять к элементу с `position: sticky` — это ломает sticky-поведение (создаётся новый stacking context). Решение: оставить `position: sticky` на `<header>`, добавить `overflow: hidden`, а transform применить на inner wrapper `<div>`.

```tsx
// <header> — оставить position: sticky, top: 0, добавить overflow: hidden
// Inner wrapper div:
style={{
  transform: isHidden ? 'translateY(-100%)' : 'translateY(0)',
  transition: 'transform 0.25s ease',
}}
```

Дополнительно: в `useEffect` измеряем высоту шапки через `ResizeObserver` на `headerRef` и пишем в CSS-переменную:
```ts
const observer = new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty(
    '--header-height',
    `${entry.contentRect.height}px`
  )
})
observer.observe(headerRef.current)
return () => observer.disconnect() // обязательный cleanup
```

### Строка фильтров (`BooksPage.tsx`)

Фильтры сейчас не sticky. Строка фильтров — два вложенных div: внешний (с `borderBottom` и фоном) и внутренний `.filters-bar`. **`position: sticky` и `transform` применяются к внешнему div** — иначе белая полоса с рамкой останется на месте как артефакт.

```tsx
const { isHidden } = useScrollHide()

// Внешний div фильтров:
style={{
  position: 'sticky',
  top: 'var(--header-height, 57px)',
  transform: isHidden
    ? 'translateY(calc(-1 * var(--header-height, 57px)))'
    : 'translateY(0)',
  transition: 'transform 0.25s ease',
  zIndex: 90, // ниже шапки (zIndex: 100)
  // ... существующие стили (backgroundColor, borderBottom и др.)
}}
```

**Edge case: AboutBlock.** Когда блок «Что это?» видим (новые пользователи), между шапкой и фильтрами есть `<AboutBlock>`. Фильтры всё равно корректно залипают через `top: var(--header-height)` — AboutBlock прокручивается мимо, а фильтры прилипают к позиции ниже шапки. Артефактов нет.

### Существующий scroll listener в BooksPage.tsx

`BooksPage.tsx` уже имеет свой `scroll`-listener для кнопки «Наверх». Два пассивных listener'а на `window` — допустимо по производительности. Сливать их не нужно: `useScrollHide` — отдельная ответственность. `BooksPage` будет иметь оба listener'а независимо.

---

## CSS-переменная `--header-height`

Устанавливается динамически из `Header.tsx` через `ResizeObserver`. Fallback: `57px`. Позволяет фильтрам точно знать высоту шапки без хардкода и без prop drilling.

---

## Тесты

Юнит-тест для логики `useScrollHide`:
- scroll down > 60px → `isHidden` становится `true`
- scroll up → `isHidden` становится `false`
- scroll down при `scrollY < 10px` → `isHidden` остаётся `false`

E2E-тесты не добавляем: скролл-поведение ненадёжно тестировать в Playwright.

---

## Файлы проекта

| Файл | Изменение |
|---|---|
| `lib/scroll-hide-context.tsx` | NEW — `'use client'`, контекст + хук |
| `app/layout.tsx` | Добавить `ScrollHideProvider` вокруг `{children}` |
| `components/nd/Header.tsx` | Inner wrapper + transform + ResizeObserver |
| `components/nd/BooksPage.tsx` | `useScrollHide` + sticky + transform на внешнем div фильтров |

# Подборки — PR 4: блок на главной

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Акцентный блок «Подборки» с каруселью карточек-стопок между `AboutBlock` и фильтрами каталога; показывается только при включённом переключателе.

**Architecture:** `app/page.tsx` читает настройку `collections_home_block_enabled` и, если она включена, список подборок; `BooksPage` получает `homeCollections: CollectionListItem[] | null` (`null` — блок выключен) и рендерит `HomeCollectionsBlock`. Карусель — отдельный компонент `CollectionsCarousel` с нативной прокруткой, snap, маской краёв и стрелками.

**Tech Stack:** React client components, CSS `scroll-snap` и `mask-image`, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md` → «Дизайн → Главная — блок подборок». Контракты — `00-overview.md`.

## Global Constraints

См. `00-overview.md`. Для этого PR (из спеки дословно): полоса `padding: 26px` (моб. `20px 14px`), фон `--bg-tint`, линии сверху и снизу `1px solid var(--border-strong)`; заголовок «Подборки» `--nd-serif` 700 24px/1.15/−0.01em (моб. 20px); подзаголовок «Книги, объединённые одной темой» 12px `--text-secondary` max 460px; кнопки «Все подборки» (ghost) и «Собрать свою» (dark); карусель `gap: 14px`, карточка `calc((100% - 60px) / 3.35)`, на мобильном `82%`; маска краёв 22px слева / 78px справа, снимается у крайнего положения; стрелки 36×36 (моб. 30×30), `left/right: 10px` (моб. 6px), без рамки и фона, 17px `--text-secondary`, скрыты у своего края; клик — прокрутка на ширину карточки + 14; пустое состояние — текст из спеки и кнопка «Собрать первую подборку». `BooksPage` не использует `useRouter` (его тесты не мокают `next/navigation`) — переходы через `window.location.assign`.

## Подготовка

- [ ] PR 3 смержен (владелец может включить блок в админке).
- [ ] Worktree `../book-club-collections-4`, ветка `feat/collections-home-block` от свежего `origin/main`; симлинки как в PR 2.

---

### Task 1: Карусель и блок

**Files:**
- Create: `components/nd/CollectionsCarousel.tsx`, `components/nd/HomeCollectionsBlock.tsx`, `components/nd/HomeCollectionsBlock.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `CollectionStackCard` (PR 2), `CollectionListItem`, `track`
- Produces: `<CollectionsCarousel>{cards}</CollectionsCarousel>`, `<HomeCollectionsBlock collections onCreate />`

- [ ] **Step 1: Тест**

```tsx
// components/nd/HomeCollectionsBlock.test.tsx
/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import HomeCollectionsBlock from './HomeCollectionsBlock'
import { track } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CollectionStackCard', () => ({ __esModule: true, default: ({ collection, onOpen }: { collection: { title: string }; onOpen: () => void }) => <a onClick={onOpen}>{collection.title}</a> }))

beforeAll(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} } as never
})

const item = (id: string) => ({ id, slug: id, title: `Подборка ${id}`, textsCount: 3, covers: [], sortAt: '' })

it('заголовок, подзаголовок и карточки', () => {
  render(<HomeCollectionsBlock collections={[item('a'), item('b')]} onCreate={jest.fn()} />)
  expect(screen.getByRole('heading', { name: 'Подборки' })).toBeInTheDocument()
  expect(screen.getByText('Книги, объединённые одной темой')).toBeInTheDocument()
  expect(screen.getByText('Подборка b')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Все подборки' })).toHaveAttribute('href', '/collections')
})

it('пустое состояние с приглашением', () => {
  const onCreate = jest.fn()
  render(<HomeCollectionsBlock collections={[]} onCreate={onCreate} />)
  expect(screen.getByText(/Пока ни одной подборки/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Собрать первую подборку' }))
  expect(onCreate).toHaveBeenCalled()
})

it('клик по карточке уходит в аналитику с источником', () => {
  render(<HomeCollectionsBlock collections={[item('a')]} onCreate={jest.fn()} />)
  fireEvent.click(screen.getByText('Подборка a'))
  expect(track).toHaveBeenCalledWith('collections_opened', { source: 'home_block', collection_id: 'a' })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/CollectionsCarousel.tsx
'use client'

import { Children, useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'

const GAP = 14
const EDGE_TOLERANCE = 6

export default function CollectionsCarousel({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const scrolledOnce = useRef(false)

  const check = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setAtStart(el.scrollLeft < EDGE_TOLERANCE)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_TOLERANCE)
  }, [])

  useEffect(() => {
    check()
    const el = trackRef.current
    if (!el) return
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [check, children])

  function handleScroll() {
    check()
    if (!scrolledOnce.current) {
      scrolledOnce.current = true
      track('collections_carousel_scrolled', {})
    }
  }

  function nudge(direction: 1 | -1) {
    const el = trackRef.current
    const card = el?.firstElementChild as HTMLElement | null
    if (!el) return
    const step = card ? card.getBoundingClientRect().width + GAP : el.clientWidth * 0.8
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  const maskClass = ['collections-carousel', atStart ? 'at-start' : '', atEnd ? 'at-end' : ''].filter(Boolean).join(' ')

  return (
    <div style={{ position: 'relative' }}>
      <div ref={trackRef} className={maskClass} onScroll={handleScroll} data-testid="collections-carousel">
        {Children.map(children, (child) => <div className="collections-carousel-item">{child}</div>)}
      </div>
      {!atStart && (
        <button type="button" aria-label="Назад" className="collections-carousel-arrow prev" onClick={() => nudge(-1)}>←</button>
      )}
      {!atEnd && (
        <button type="button" aria-label="Вперёд" className="collections-carousel-arrow next" onClick={() => nudge(1)}>→</button>
      )}
    </div>
  )
}
```

`app/globals.css` — стили карусели (маска и медиа-запросы не выразить inline; цвета — только токены):

```css
/* Подборки: карусель на главной */
.collections-carousel {
  display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x proximity;
  scrollbar-width: none; -ms-overflow-style: none; padding-bottom: 2px;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 calc(100% - 78px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 calc(100% - 78px), transparent 100%);
}
.collections-carousel::-webkit-scrollbar { display: none; }
.collections-carousel.at-start {
  -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 78px), transparent 100%);
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 78px), transparent 100%);
}
.collections-carousel.at-end {
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 22px, #000 100%);
}
.collections-carousel.at-start.at-end { -webkit-mask-image: none; mask-image: none; }
.collections-carousel-item { flex: 0 0 calc((100% - 60px) / 3.35); scroll-snap-align: start; }
.collections-carousel-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px;
  border: none; background: transparent; color: var(--text-secondary); font-size: 17px; line-height: 1;
  display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 3; font-family: var(--nd-sans);
}
.collections-carousel-arrow:hover { color: var(--text); }
.collections-carousel-arrow.prev { left: 10px; }
.collections-carousel-arrow.next { right: 10px; }
.home-collections { padding: 26px; background: var(--bg-tint); border-top: 1px solid var(--border-strong); border-bottom: 1px solid var(--border-strong); }
@media (max-width: 540px) {
  .home-collections { padding: 20px 14px; }
  .home-collections-head { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }
  .home-collections-title { font-size: 20px !important; }
  .collections-carousel-item { flex-basis: 82%; }
  .collections-carousel-arrow { width: 30px; height: 30px; font-size: 13px; }
  .collections-carousel-arrow.prev { left: 6px; }
  .collections-carousel-arrow.next { right: 6px; }
}
```

> `#000` в `mask-image` — не цвет интерфейса, а непрозрачность маски; правило «только токены» касается видимых цветов, а `check-no-raw-hex.sh` проверяет только `.ts/.tsx`. Если ревьюер против — замени на `black`.
> Точку медиа-запроса (`540px`) сверь с тем, на какой ширине `app/globals.css` переключает `.catalog-desktop` / `.catalog-mobile`, и возьми ту же.

```tsx
// components/nd/HomeCollectionsBlock.tsx
'use client'

import Link from 'next/link'
import type { CollectionListItem } from '@/lib/collections/types'
import { track } from '@/lib/analytics'
import CollectionStackCard from './CollectionStackCard'
import CollectionsCarousel from './CollectionsCarousel'

interface Props {
  collections: CollectionListItem[]
  onCreate: () => void
}

export default function HomeCollectionsBlock({ collections, onCreate }: Props) {
  return (
    <section className="home-collections" data-testid="home-collections">
      <div className="home-collections-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <h2 className="home-collections-title" style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.01em', margin: 0 }}>
            Подборки
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.5, margin: '6px 0 0' }}>
            Книги, объединённые одной темой
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href="/collections" className="p-btn ghost sm" onClick={() => track('collections_opened', { source: 'home_block' })}>
            Все подборки
          </Link>
          <button type="button" className="p-btn sm" onClick={onCreate}>Собрать свою</button>
        </div>
      </div>
      {collections.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
            Пока ни одной подборки. Если вы дочитали книгу с кругом и знаете, что читать дальше, — соберите первую: название, пара абзацев и две-три книги из каталога.
          </p>
          <button type="button" className="p-btn" style={{ marginTop: 16 }} onClick={onCreate}>Собрать первую подборку</button>
        </div>
      ) : (
        <CollectionsCarousel>
          {collections.map((collection) => (
            <CollectionStackCard
              key={collection.id}
              collection={collection}
              onOpen={() => track('collections_opened', { source: 'home_block', collection_id: collection.id })}
            />
          ))}
        </CollectionsCarousel>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Прогон** `npx jest components/nd/HomeCollectionsBlock` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/CollectionsCarousel.tsx components/nd/HomeCollectionsBlock.tsx components/nd/HomeCollectionsBlock.test.tsx app/globals.css
git commit -m "feat(collections): блок подборок с каруселью"
```

---

### Task 2: Подключение к главной

**Files:**
- Modify: `app/page.tsx`, `components/nd/BooksPage.tsx`
- Test: `components/nd/BooksPage.collections.test.tsx`

**Interfaces:**
- Consumes: `getSiteSetting`, `listPublishedCollections`, `saveCreateIntent`, `consumeCreateIntent`
- Produces: проп `BooksPage.homeCollections?: CollectionListItem[] | null`

- [ ] **Step 1: Тест** — по образцу `components/nd/BooksPage.matching-strip.test.tsx` (скопируй его моки и базовые пропсы целиком):

```tsx
// components/nd/BooksPage.collections.test.tsx
/**
 * @jest-environment jsdom
 */
// ...все jest.mock из BooksPage.matching-strip.test.tsx...
jest.mock('./HomeCollectionsBlock', () => ({
  __esModule: true,
  default: ({ collections, onCreate }: { collections: unknown[]; onCreate: () => void }) => (
    <section data-testid="home-collections"><span>{collections.length}</span><button onClick={onCreate}>Собрать свою</button></section>
  ),
}))

// baseProps — те же, что в matching-strip тесте

beforeEach(() => localStorage.clear())

it('блок не рендерится, когда выключен', () => {
  mockSession.mockReturnValue({ data: null })
  render(<BooksPage {...baseProps} homeCollections={null} />)
  expect(screen.queryByTestId('home-collections')).toBeNull()
})

it('блок стоит после «Что это» и до фильтров', () => {
  mockSession.mockReturnValue({ data: null })
  render(<BooksPage {...baseProps} homeCollections={[]} />)
  const about = screen.getByTestId('about-block')
  const block = screen.getByTestId('home-collections')
  expect(about.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('гость «Собрать свою» — намерение сохраняется', () => {
  mockSession.mockReturnValue({ data: null })
  render(<BooksPage {...baseProps} homeCollections={[]} />)
  fireEvent.click(screen.getByText('Собрать свою'))
  expect(localStorage.getItem('collectionCreateIntent')).not.toBeNull()
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

`components/nd/BooksPage.tsx`:

```tsx
import type { CollectionListItem } from '@/lib/collections/types'
import { consumeCreateIntent, saveCreateIntent } from '@/lib/collections/intents'
import HomeCollectionsBlock from './HomeCollectionsBlock'

// в Props:
  /** null — блок выключен в админке. */
  homeCollections?: CollectionListItem[] | null

// в сигнатуре: ..., matchingStripSessionId = null, homeCollections = null }: Props

// рядом с эффектом submitIntent:
useEffect(() => {
  if (isLoggedIn && consumeCreateIntent()) window.location.assign('/collections/new')
}, [isLoggedIn])

function handleCreateCollection() {
  if (isLoggedIn) {
    window.location.assign('/collections/new')
    return
  }
  saveCreateIntent()
  track('auth_modal_opened', { trigger: 'collection_create' })
  setAuthModalEntryPoint('collection_create')
  setAuthModalOpen(true)
}

// в JSX сразу после блока {aboutVisible && (<AboutBlock … />)} и до {/* Search + filters */}:
{homeCollections && (
  <HomeCollectionsBlock collections={homeCollections} onCreate={handleCreateCollection} />
)}
```

> Если тип `authModalEntryPoint` — union строк, добавь в него `'collection_create'`.

`app/page.tsx`:

```tsx
import { getSiteSetting } from '@/lib/site-settings'
import { listPublishedCollections } from '@/lib/collections/repo'

// в Promise.all добавить последним элементом:
    getSiteSetting('collections_home_block_enabled').catch(() => false),

// деструктуризация: const [session, books, signups, tagDescs, intro, openSessionRows, homeBlockEnabled] = await Promise.all([...])

// после Promise.all:
  const homeCollections = homeBlockEnabled
    ? await listPublishedCollections().catch(() => [])
    : null

// в <BooksPage …>:
  homeCollections={homeCollections}
```

- [ ] **Step 4: Прогон** `npx jest components/nd/BooksPage` → PASS (все существующие тесты `BooksPage.*` тоже: проп необязательный)

- [ ] **Step 5: Коммит**

```bash
git add app/page.tsx components/nd/BooksPage.tsx components/nd/BooksPage.collections.test.tsx
git commit -m "feat(collections): блок подборок на главной по переключателю"
```

---

### Task 3: E2E, документация, PR

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/collections-home.spec.ts`
- Modify: `docs/features/collections.md`, `docs/wiki/Book-Collections.md`, `docs/wiki/Books-Catalog.md`

- [ ] **Step 1: Фикстура настройки.** Переключатель глобальный, а e2e-ветка Neon общая для nightly и локальных прогонов (`docs/features/testing.md`, «Cleanup сносит только хвосты…»). Поэтому фикстура запоминает исходное значение и восстанавливает его в teardown:

```ts
// в interface E2EHelpers:
  /** Выставляет collections_home_block_enabled и возвращает прежнее значение в teardown. */
  setHomeCollectionsBlock: (enabled: boolean) => Promise<void>

// в base.extend:
  setHomeCollectionsBlock: async ({ dbExec }, use) => {
    const rows = await dbExec("select value from site_settings where id = 'collections_home_block_enabled'") as Array<{ value: unknown }>
    const original = rows[0]?.value
    let touched = false
    await use(async (enabled) => {
      touched = true
      await dbExec(
        `insert into site_settings (id, value, updated_at) values ('collections_home_block_enabled', $1::jsonb, now())
         on conflict (id) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(enabled)],
      )
    })
    if (!touched) return
    if (original === undefined) {
      await dbExec("delete from site_settings where id = 'collections_home_block_enabled'")
    } else {
      await dbExec("update site_settings set value = $1::jsonb where id = 'collections_home_block_enabled'", [JSON.stringify(original)])
    }
    await dbExec("delete from audit_log where entity_type = 'site_settings' and entity_id = 'collections_home_block_enabled' and occurred_at > now() - interval '1 hour' and source = 'trigger'")
  },
```

> Возвращаемое значение `dbExec` сверь с существующими вызовами в `e2e/fixtures.ts` (массив строк или `{ rows }`).

- [ ] **Step 2: Спека**

```ts
// e2e/collections-home.spec.ts
import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => {
  await epic('Подборки')
  await feature('Блок на главной')
})

test('выключенный блок не показывается, включённый — показывается после перезагрузки', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection, setHomeCollectionsBlock }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })
  await setHomeCollectionsBlock(false)

  await page.goto('/')
  await expect(page.getByTestId('home-collections')).toHaveCount(0)

  await loginAsAdmin()
  await page.goto('/admin?view=collections')
  const toggle = page.getByRole('button', { name: /Блок подборок на главной/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 })
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/admin/collections/settings') && res.request().method() === 'PATCH'),
    toggle.click(),
  ])

  await page.goto('/')
  await page.reload()
  const block = page.getByTestId('home-collections')
  await expect(block).toBeVisible()
  await expect(block).toContainText(collection.title)
})

test('карусель: около 3,35 карточки на десктопе, 82% на телефоне, стрелки у краёв', async ({ page, loginAsUser, createTestBook, createTestCollection, setHomeCollectionsBlock }) => {
  const author = await loginAsUser()
  for (let i = 0; i < 5; i++) {
    const books = [await createTestBook(), await createTestBook()]
    await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })
  }
  await setHomeCollectionsBlock(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const carousel = page.getByTestId('collections-carousel')
  const track = (await carousel.boundingBox())!
  const card = (await carousel.locator('.collections-carousel-item').first().boundingBox())!
  // ширина карточки = (ширина ленты − 60) / 3.35
  expect(Math.abs(card.width - (track.width - 60) / 3.35)).toBeLessThan(2)
  await expect(page.getByRole('button', { name: 'Назад' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Вперёд' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobileTrack = (await page.getByTestId('collections-carousel').boundingBox())!
  const mobileCard = (await page.locator('.collections-carousel-item').first().boundingBox())!
  expect(Math.abs(mobileCard.width - mobileTrack.width * 0.82)).toBeLessThan(2)
})
```

> Первый тест: после `loginAsUser` на главной у пользователя без контактов откроется `ContactsForm` и перекроет клики — здесь кликов по главной нет, только проверка видимости; если оверлей мешает `toBeVisible`, выставь контакты через `PATCH /api/profile` как в `e2e/collections.spec.ts`.
> Карусель смотрят только опубликованные подборки из e2e-ветки: чужие подборки параллельного прогона могут оказаться в ленте — проверки завязаны на геометрию первой карточки, а не на её название.

- [ ] **Step 3: Прогон** `npm run test:e2e:focused -- e2e/collections-home.spec.ts`

- [ ] **Step 4: Документация.** `docs/wiki/Book-Collections.md` — где блок на главной и как его включить; `docs/wiki/Books-Catalog.md` — порядок блоков главной с новым блоком; `docs/features/collections.md` — `HomeCollectionsBlock`, `CollectionsCarousel`, чтение настройки в `app/page.tsx`, фикстура `setHomeCollectionsBlock` и почему она восстанавливает значение.

- [ ] **Step 5: Проверка, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
```

В ответе:
- «E2E: нужен — условный рендер блока по настройке с перезагрузкой и CSS-поведение карусели (`boundingBox`); `e2e/collections-home.spec.ts` прогнан focused».
- «Wiki: нужна — изменилась главная страница (`docs/wiki/Book-Collections.md`, `docs/wiki/Books-Catalog.md`)».

```bash
git add e2e/fixtures.ts e2e/collections-home.spec.ts docs
git commit -m "test(collections): E2E блока на главной и документация"
git push -u origin feat/collections-home-block
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable
```

После мержа — напомнить владельцу, что блок выключен, пока он не включит его во вкладке «Подборки» в админке; `../book-club-collections-4` можно удалить.

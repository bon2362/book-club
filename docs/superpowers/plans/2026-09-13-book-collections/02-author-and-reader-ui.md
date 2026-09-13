# Подборки — PR 2: интерфейс автора и читателя

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница «Все подборки», страница подборки с записью на книги, редактор с автосохранением, вкладка «Подборки» в профиле и картинка превью ссылки.

**Architecture:** Серверные страницы в `app/collections/**` читают данные через `lib/collections/repo.ts` (PR 1) и отдают их клиентским компонентам в `components/nd/`. Мутации — только через API PR 1. Карточка книги — существующий `BookCard` / `BookCardMobile` с новым пропом `ignoreClubStatus`.

**Tech Stack:** Next.js 14 App Router (server + client components), NextAuth `useSession`, Testing Library (jsdom), Playwright, `next/og`.

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md` — разделы «Роли и сценарии», «Дизайн → Все подборки / Страница подборки / Редактор / Профиль / Картинка превью». Контракты — `00-overview.md`.

## Global Constraints

См. `00-overview.md` → «Global Constraints». Для UI особенно: только `var(--…)`, примитивы `.p-btn`, `.p-btn.ghost`, `.p-btn.sm`, `.p-btn.block`, `.p-link`, `.p-link.muted`, `.p-input`; модалки с `role="dialog"`; своих статусов не делать через `role="status"` (конфликт с `@dnd-kit` на других страницах) — используй `data-testid`.

## Подготовка

- [ ] PR 1 смержен в `main`.
- [ ] **Worktree**

```bash
cd /Users/ekoshkin/book-club
git fetch origin main
git worktree add ../book-club-collections-2 -b feat/collections-author-reader-ui origin/main
cd ../book-club-collections-2
ln -s ../book-club/node_modules node_modules
ln -s ../book-club/.env.local .env.local
ln -s ../book-club/.env.test.local .env.test.local
```

- [ ] **Миграция в e2e-ветку** (однократно; безопасно повторять — всё `IF NOT EXISTS`, но триггеры создаются без `IF NOT EXISTS`: при повторе будет ошибка «trigger already exists» — это значит, что миграция уже применена)

```bash
node --env-file=.env.test.local scripts/apply-migration.mjs drizzle/0066_book_collections.sql
```

---

### Task 1: Карточка книги без статуса клуба

**Files:**
- Modify: `components/nd/BookCard.tsx`, `components/nd/BookCardMobile.tsx`
- Test: `components/nd/BookCard.test.tsx`, `components/nd/BookCardMobile.test.tsx`

**Interfaces:**
- Produces: проп `ignoreClubStatus?: boolean` у обеих карточек

- [ ] **Step 1: Тесты** — дописать в оба файла (подставь существующий в файле помощник создания книги, если он есть; иначе используй этот объект):

```tsx
const readBook = {
  id: 'b1', slug: null, name: 'Долг', tags: [], author: 'Гребер', type: 'Book', pages: '534', date: '2011',
  link: '', description: 'Описание', coverUrl: null, whyRead: 'Потому что', recommendationLink: null,
  isNew: true, status: 'read' as const, signupCount: 0, summaryCount: 0,
}

it('по умолчанию показывает статус клуба', () => {
  render(<BookCard book={readBook} isSelected={false} onToggle={jest.fn()} />)
  expect(screen.getAllByText('Прочитано').length).toBeGreaterThan(0)
})

it('ignoreClubStatus убирает метки статуса клуба', () => {
  render(<BookCard book={{ ...readBook, status: 'reading' }} isSelected={false} onToggle={jest.fn()} ignoreClubStatus />)
  expect(screen.queryByText('Прочитано')).toBeNull()
  expect(screen.queryByText('Сейчас читаем')).toBeNull()
})
```

Для `BookCardMobile.test.tsx` — те же два теста с `BookCardMobile`.

- [ ] **Step 2: Прогон — второй тест падает** (`npx jest components/nd/BookCard`)

- [ ] **Step 3: Реализация** — в обеих карточках:

```tsx
interface Props {
  // ...существующие пропсы
  /** Страница подборки: статусы клуба «Сейчас читаем» / «Прочитано» не показываются. */
  ignoreClubStatus?: boolean
}

export default function BookCard({ book, isSelected, onToggle, personalStatus, position, onDescriptionExpand, ignoreClubStatus = false }: Props) {
  // ...
  const isReading = !ignoreClubStatus && book.status === 'reading'
  const isRead = !ignoreClubStatus && book.status === 'read'
```

Больше ничего не менять: всё оформление статуса уже считается из `isRead` / `isReading`.

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/BookCard.tsx components/nd/BookCardMobile.tsx components/nd/BookCard.test.tsx components/nd/BookCardMobile.test.tsx
git commit -m "feat(collections): карточка книги без статуса клуба"
```

---

### Task 2: Намерения гостя и общие подписи статусов

**Files:**
- Create: `lib/collections/intents.ts`, `lib/collections/intents.test.ts`, `components/nd/collection-status.ts`

**Interfaces:**
- Produces: `saveSignupIntent({ collectionRef, bookId })`, `consumeSignupIntent(collectionRef, now?): string | null`, `saveCreateIntent(now?)`, `consumeCreateIntent(now?): boolean`; `COLLECTION_STATUS_LABEL`, `COLLECTION_STATUS_COLOR`

- [ ] **Step 1: Тест**

```ts
// lib/collections/intents.test.ts
/**
 * @jest-environment jsdom
 */
import { consumeCreateIntent, consumeSignupIntent, saveCreateIntent, saveSignupIntent } from './intents'

beforeEach(() => localStorage.clear())

describe('намерение записаться', () => {
  it('отдаётся один раз и только своей подборке', () => {
    saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' })
    expect(consumeSignupIntent('drugaya')).toBeNull()
    expect(consumeSignupIntent('tema')).toBe('b1')
    expect(consumeSignupIntent('tema')).toBeNull()
  })
  it('устаревает через 30 минут', () => {
    saveSignupIntent({ collectionRef: 'tema', bookId: 'b1' })
    expect(consumeSignupIntent('tema', Date.now() + 31 * 60_000)).toBeNull()
  })
  it('битое значение не ломает страницу', () => {
    localStorage.setItem('collectionSignupIntent', '{')
    expect(consumeSignupIntent('tema')).toBeNull()
  })
})

describe('намерение собрать подборку', () => {
  it('отдаётся один раз', () => {
    saveCreateIntent()
    expect(consumeCreateIntent()).toBe(true)
    expect(consumeCreateIntent()).toBe(false)
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/intents.ts
const SIGNUP_KEY = 'collectionSignupIntent'
const CREATE_KEY = 'collectionCreateIntent'
const TTL_MS = 30 * 60_000

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveSignupIntent(intent: { collectionRef: string; bookId: string }, now = Date.now()): void {
  storage()?.setItem(SIGNUP_KEY, JSON.stringify({ ...intent, savedAt: now }))
}

export function consumeSignupIntent(collectionRef: string, now = Date.now()): string | null {
  const store = storage()
  const raw = store?.getItem(SIGNUP_KEY)
  if (!store || !raw) return null
  try {
    const parsed = JSON.parse(raw) as { collectionRef?: unknown; bookId?: unknown; savedAt?: unknown }
    if (parsed.collectionRef !== collectionRef) return null
    store.removeItem(SIGNUP_KEY)
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > TTL_MS) return null
    return typeof parsed.bookId === 'string' ? parsed.bookId : null
  } catch {
    store.removeItem(SIGNUP_KEY)
    return null
  }
}

export function saveCreateIntent(now = Date.now()): void {
  storage()?.setItem(CREATE_KEY, String(now))
}

export function consumeCreateIntent(now = Date.now()): boolean {
  const store = storage()
  const raw = store?.getItem(CREATE_KEY)
  if (!store || !raw) return false
  store.removeItem(CREATE_KEY)
  return now - Number(raw) <= TTL_MS
}
```

```ts
// components/nd/collection-status.ts
import type { CollectionStatus } from '@/lib/collections/types'

export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  published: 'Опубликована',
  rejected: 'Отклонена',
  hidden: 'Скрыта',
}

export const COLLECTION_STATUS_COLOR: Record<CollectionStatus, string> = {
  draft: 'var(--text-muted)',
  pending: 'var(--text)',
  published: 'var(--success)',
  rejected: 'var(--accent)',
  hidden: 'var(--text-secondary)',
}

export const COLLECTION_REASON_PREFIX: Partial<Record<CollectionStatus, string>> = {
  rejected: 'Почему не опубликовали:',
  hidden: 'Почему скрыли:',
}
```

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/intents.ts lib/collections/intents.test.ts components/nd/collection-status.ts
git commit -m "feat(collections): намерения гостя до входа и подписи статусов"
```

---

### Task 3: Карточка подборки и страница «Все подборки»

**Files:**
- Create: `components/nd/CollectionStackCard.tsx`, `components/nd/CollectionStackCard.test.tsx`, `components/nd/CollectionsIndex.tsx`, `components/nd/CollectionsIndex.test.tsx`, `app/collections/page.tsx`

**Interfaces:**
- Consumes: `CollectionListItem`, `listPublishedCollections`, `textsCount`, `collectionsCount`, `saveCreateIntent`, `consumeCreateIntent`
- Produces: `<CollectionStackCard collection onOpen? />`, `<CollectionsIndex collections isLoggedIn isAdmin openCreate />`

- [ ] **Step 1: Тесты**

```tsx
// components/nd/CollectionStackCard.test.tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import CollectionStackCard from './CollectionStackCard'

jest.mock('./CoverImage', () => ({ __esModule: true, default: ({ title }: { title: string }) => <img alt={title} /> }))

const collection = {
  id: 'c1', slug: 'tema', title: 'Как государство научилось видеть', textsCount: 7, sortAt: '2026-09-10T00:00:00Z',
  covers: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, title: `Книга ${i}`, author: 'Автор', coverUrl: null })),
}

it('ведёт на страницу подборки и показывает счётчик текстов', () => {
  render(<CollectionStackCard collection={collection} />)
  expect(screen.getByRole('link')).toHaveAttribute('href', '/collections/tema')
  expect(screen.getByText('7 текстов')).toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(5)
})
```

```tsx
// components/nd/CollectionsIndex.test.tsx
/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import CollectionsIndex from './CollectionsIndex'

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> }))
jest.mock('./AuthModal', () => ({ __esModule: true, default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Вход</div> : null) }))
jest.mock('./CollectionStackCard', () => ({ __esModule: true, default: ({ collection }: { collection: { title: string } }) => <a>{collection.title}</a> }))

beforeEach(() => localStorage.clear())

it('пустое состояние', () => {
  render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />)
  expect(screen.getByText(/Подборок пока нет/)).toBeInTheDocument()
})

it('гость нажимает «Собрать свою» — окно входа и сохранённое намерение', () => {
  render(<CollectionsIndex collections={[]} isLoggedIn={false} isAdmin={false} openCreate={false} />)
  fireEvent.click(screen.getAllByRole('button', { name: /Собрать/ })[0])
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(localStorage.getItem('collectionCreateIntent')).not.toBeNull()
})

it('счётчик подборок', () => {
  const item = { id: 'c', slug: 's', title: 'Т', textsCount: 2, covers: [], sortAt: '' }
  render(<CollectionsIndex collections={[item, { ...item, id: 'd', title: 'Д' }]} isLoggedIn isAdmin={false} openCreate={false} />)
  expect(screen.getByText('2 подборки')).toBeInTheDocument()
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/CollectionStackCard.tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CollectionListItem } from '@/lib/collections/types'
import { textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'

interface Props {
  collection: CollectionListItem
  onOpen?: () => void
}

const COVER_WIDTH = 56
const COVER_OVERLAP = 18

export default function CollectionStackCard({ collection, onOpen }: Props) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href={`/collections/${collection.slug}`}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="collection-card"
      style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--text)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 104 }}>
        {collection.covers.map((cover, index) => (
          <div
            key={cover.id}
            style={{
              width: COVER_WIDTH,
              aspectRatio: '2 / 3',
              flex: 'none',
              marginLeft: index === 0 ? 0 : -COVER_OVERLAP,
              borderRight: '1px solid var(--border)',
              position: 'relative',
              zIndex: index,
              overflow: 'hidden',
            }}
          >
            <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: 'var(--nd-mono)', fontSize: 11, color: 'var(--accent)' }}>
          {textsCount(collection.textsCount)}
        </span>
        <span
          style={{
            fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 21, lineHeight: 1.16, letterSpacing: '-0.01em',
            alignSelf: 'flex-start',
            borderBottom: `1px solid ${hovered ? 'var(--border-strong)' : 'transparent'}`,
          }}
        >
          {collection.title}
        </span>
      </div>
    </Link>
  )
}
```

> Если у `CoverImage` есть обязательные пропсы помимо `coverUrl` / `title` / `author` (см. `components/nd/CoverImage.tsx:15`) — передай их так же, как `BookCard`.

```tsx
// components/nd/CollectionsIndex.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CollectionListItem } from '@/lib/collections/types'
import { collectionsCount } from '@/lib/collections/format'
import { consumeCreateIntent, saveCreateIntent } from '@/lib/collections/intents'
import { track } from '@/lib/analytics'
import Header from './Header'
import AuthModal from './AuthModal'
import CollectionStackCard from './CollectionStackCard'

interface Props {
  collections: CollectionListItem[]
  isLoggedIn: boolean
  isAdmin: boolean
  /** Пришли с /collections/new без входа. */
  openCreate: boolean
}

export default function CollectionsIndex({ collections, isLoggedIn, isAdmin, openCreate }: Props) {
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (isLoggedIn && consumeCreateIntent()) {
      window.location.assign('/collections/new')
      return
    }
    if (!isLoggedIn && openCreate) {
      saveCreateIntent()
      setAuthOpen(true)
    }
  }, [isLoggedIn, openCreate])

  function handleCreate() {
    if (isLoggedIn) {
      window.location.assign('/collections/new')
      return
    }
    saveCreateIntent()
    track('auth_modal_opened', { trigger: 'collection_create' })
    setAuthOpen(true)
  }

  return (
    <>
      <Header onSignIn={!isLoggedIn ? () => setAuthOpen(true) : undefined} isAdmin={isAdmin} />
      <main style={{ padding: '26px', maxWidth: 1180, margin: '0 auto' }} className="collections-index">
        <Link href="/" className="p-link muted" style={{ fontSize: 11 }}>← На главную</Link>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '14px 0', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>Подборки</div>
            <h1 style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.01em', margin: '6px 0 0' }}>Все подборки</h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.5, margin: '6px 0 0' }}>
              Собраны участниками клуба. Первыми — те, что недавно создали или изменили.
            </p>
          </div>
          <button type="button" className="p-btn sm" onClick={handleCreate}>Собрать свою</button>
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 18 }}>
          {collections.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{collectionsCount(collections.length)}</span>
          )}
        </div>
        {collections.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              Подборок пока нет. Первую может собрать любой вошедший: название, пара абзацев о том, зачем это читать, и хотя бы две книги.
            </p>
            <button type="button" className="p-btn" style={{ marginTop: 16 }} onClick={handleCreate}>Собрать первую</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {collections.map((collection) => (
              <CollectionStackCard
                key={collection.id}
                collection={collection}
                onOpen={() => track('collection_card_opened', { collection_id: collection.id, source: 'collections_index' })}
              />
            ))}
          </div>
        )}
      </main>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} callbackUrl="/collections" entryPoint="collection_create" />
    </>
  )
}
```

> Мобильный отступ 14px: добавь в `app/globals.css` рядом с другими медиа-правилами `@media (max-width: 540px) { .collections-index { padding: 16px 14px !important; } }` и такое же правило для `.collection-page`, `.collection-editor` из Task 4–5.

```tsx
// app/collections/page.tsx
import { auth } from '@/lib/auth'
import { listPublishedCollections } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import CollectionsIndex from '@/components/nd/CollectionsIndex'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Подборки — Долгое наступление' }

export default async function CollectionsPage({ searchParams }: { searchParams: { create?: string } }) {
  const [session, collections] = await Promise.all([
    auth(),
    listPublishedCollections().catch((error) => {
      if (isMissingCollectionsSchemaError(error)) return []
      throw error
    }),
  ])
  return (
    <CollectionsIndex
      collections={collections}
      isLoggedIn={Boolean(session?.user?.id)}
      isAdmin={Boolean(session?.user?.isAdmin)}
      openCreate={searchParams.create === '1'}
    />
  )
}
```

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/CollectionStackCard.tsx components/nd/CollectionStackCard.test.tsx components/nd/CollectionsIndex.tsx components/nd/CollectionsIndex.test.tsx app/collections/page.tsx app/globals.css
git commit -m "feat(collections): страница «Все подборки» и карточка-стопка"
```

---

### Task 4: Страница подборки

**Files:**
- Create: `components/nd/CollectionStatusBanner.tsx`, `components/nd/CollectionPageClient.tsx`, `components/nd/CollectionPageClient.test.tsx`, `app/collections/[slugOrId]/page.tsx`

**Interfaces:**
- Consumes: `loadCollectionPageData`, `serializeCollection`, `getUserSignupState`, `consumeSignupIntent`, `saveSignupIntent`, `formatChangedAt`, `markdownExcerpt`, `textsCount`, `POST/DELETE /api/signup-books/[bookId]`, `PATCH /api/profile`
- Produces: `<CollectionPageClient collection books viewer signupState />`, `<CollectionStatusBanner status reason />`

- [ ] **Step 1: Тест**

```tsx
// components/nd/CollectionPageClient.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CollectionPageClient from './CollectionPageClient'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> }))
jest.mock('./SummaryMarkdown', () => ({ __esModule: true, default: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))
jest.mock('./AuthorAvatar', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./AuthModal', () => ({ __esModule: true, default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Вход</div> : null) }))
jest.mock('./ContactsForm', () => ({ __esModule: true, default: () => <div role="dialog">Контакты</div> }))
// Имена с префиксом mock: только их Jest разрешает использовать внутри фабрики jest.mock.
const mockCardProps: Array<Record<string, unknown>> = []
const mockCard = (props: { book: { id: string; name: string }; isSelected: boolean; onToggle: (b: unknown) => void; ignoreClubStatus?: boolean }) => {
  mockCardProps.push(props)
  return <article><button onClick={() => props.onToggle(props.book)}>{props.isSelected ? '✓ В вашем списке' : `Хочу читать ${props.book.name}`}</button></article>
}
jest.mock('./BookCard', () => ({ __esModule: true, default: (p: never) => mockCard(p) }))
jest.mock('./BookCardMobile', () => ({ __esModule: true, default: () => null }))

const collection = {
  id: 'c1', slug: 'tema', authorUserId: 'author', displayName: 'Аня', title: 'Тема', descriptionMarkdown: 'Описание',
  status: 'published' as const, moderationReason: null, bookIds: ['b1', 'b2'],
  submittedAt: null, editedAt: null, publishedAt: '2026-09-10T10:00:00Z', reviewedAt: null, reviewedSnapshot: null,
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
}
const book = (id: string) => ({ book: { id, name: `Книга ${id}`, status: 'read' } as never, hiddenFromCatalog: false })
const books = [book('b1'), book('b2')]
const guest = { isLoggedIn: false, isAdmin: false, canEdit: false }
const member = { isLoggedIn: true, isAdmin: false, canEdit: false }

beforeEach(() => {
  mockCardProps.length = 0
  localStorage.clear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }) as never
})

it('рисует карточки без статуса клуба и с номерами', () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)
  expect(mockCardProps.every((p) => p.ignoreClubStatus === true)).toBe(true)
  expect(screen.getAllByText('№ 01').length).toBeGreaterThan(0)
  expect(screen.getByText('2 текста')).toBeInTheDocument()
})

it('гость: окно входа и намерение записаться', () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={guest} signupState={null} />)
  fireEvent.click(screen.getByText('Хочу читать Книга b1'))
  expect(screen.getByRole('dialog')).toHaveTextContent('Вход')
  expect(JSON.parse(localStorage.getItem('collectionSignupIntent')!)).toMatchObject({ collectionRef: 'tema', bookId: 'b1' })
})

it('участник записывается одной книгой', async () => {
  render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={{ name: 'Н', contacts: '@n', selectedBookIds: [], personalStatuses: {} }} />)
  await act(async () => { fireEvent.click(screen.getByText('Хочу читать Книга b2')) })
  expect(global.fetch).toHaveBeenCalledWith('/api/signup-books/b2', { method: 'POST' })
  await waitFor(() => expect(screen.getByText('✓ В вашем списке')).toBeInTheDocument())
})

it('нет контактов — форма контактов', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'contacts_required' }) })
  render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={{ name: '', contacts: '', selectedBookIds: [], personalStatuses: {} }} />)
  await act(async () => { fireEvent.click(screen.getByText('Хочу читать Книга b1')) })
  expect(screen.getByRole('dialog')).toHaveTextContent('Контакты')
})

it('после входа выполняет сохранённое намерение', async () => {
  localStorage.setItem('collectionSignupIntent', JSON.stringify({ collectionRef: 'tema', bookId: 'b1', savedAt: Date.now() }))
  await act(async () => {
    render(<CollectionPageClient collection={collection} books={books} viewer={member} signupState={{ name: 'Н', contacts: '@n', selectedBookIds: [], personalStatuses: {} }} />)
  })
  expect(global.fetch).toHaveBeenCalledWith('/api/signup-books/b1', { method: 'POST' })
})

it('плашка статуса для автора неопубликованной', () => {
  render(<CollectionPageClient collection={{ ...collection, status: 'hidden', moderationReason: 'Причина' }} books={books} viewer={{ isLoggedIn: true, isAdmin: false, canEdit: true }} signupState={null} />)
  expect(screen.getByTestId('collection-status-banner')).toHaveTextContent('Скрыта')
  expect(screen.getByTestId('collection-status-banner')).toHaveTextContent('Причина')
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/CollectionStatusBanner.tsx
import type { CollectionStatus } from '@/lib/collections/types'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_LABEL } from './collection-status'

export default function CollectionStatusBanner({ status, reason }: { status: CollectionStatus; reason: string | null }) {
  const prefix = COLLECTION_REASON_PREFIX[status]
  return (
    <div
      data-testid="collection-status-banner"
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', margin: '18px 0 0',
        border: '1px solid var(--border)', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)',
      }}
    >
      <span style={{ flexShrink: 0, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', borderBottom: '1px solid currentColor', paddingBottom: 2 }}>
        {COLLECTION_STATUS_LABEL[status]}
      </span>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-body)' }}>
        Подборка не опубликована. Её видите вы как автор и модератор — по ссылке другим она недоступна.
        {prefix && reason && <div style={{ marginTop: 6 }}><b style={{ fontWeight: 500 }}>{prefix}</b> {reason}</div>}
      </div>
    </div>
  )
}
```

```tsx
// components/nd/CollectionPageClient.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookWithCover } from '@/lib/books'
import type { UserSignupState } from '@/lib/signup-books'
import type { SerializedCollection } from '@/lib/collections/types'
import { formatChangedAt, textsCount } from '@/lib/collections/format'
import { consumeSignupIntent, saveSignupIntent } from '@/lib/collections/intents'
import { track } from '@/lib/analytics'
import Header from './Header'
import AuthModal from './AuthModal'
import ContactsForm from './ContactsForm'
import AuthorAvatar from './AuthorAvatar'
import SummaryMarkdown from './SummaryMarkdown'
import BookCard from './BookCard'
import BookCardMobile from './BookCardMobile'
import CollectionStatusBanner from './CollectionStatusBanner'

interface Props {
  collection: SerializedCollection
  books: Array<{ book: BookWithCover; hiddenFromCatalog: boolean }>
  viewer: { isLoggedIn: boolean; isAdmin: boolean; canEdit: boolean }
  signupState: UserSignupState | null
}

const eyebrow: React.CSSProperties = { fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.15em' }

function OrderLine({ index, hidden }: { index: number; hidden: boolean }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-strong)', padding: '6px 0 9px', fontFamily: 'var(--nd-mono)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
      <span>№ {String(index + 1).padStart(2, '0')}</span>
      {hidden && <span style={{ color: 'var(--accent)' }}>скрыта из каталога</span>}
    </div>
  )
}

export default function CollectionPageClient({ collection, books, viewer, signupState }: Props) {
  const router = useRouter()
  const ref = collection.slug ?? collection.id
  const [selected, setSelected] = useState(() => new Set(signupState?.selectedBookIds ?? []))
  const [authOpen, setAuthOpen] = useState(false)
  const [contactsForBookId, setContactsForBookId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intentHandled = useRef(false)
  const [changed, setChanged] = useState<{ relative: string; absolute: string } | null>(null)

  useEffect(() => {
    setChanged(formatChangedAt(new Date(collection.editedAt ?? collection.publishedAt ?? collection.updatedAt), new Date()))
    track('collection_viewed', {
      collection_id: collection.id,
      viewer: viewer.canEdit ? 'author' : viewer.isLoggedIn ? 'member' : 'guest',
    })
  }, [collection.id, collection.editedAt, collection.publishedAt, collection.updatedAt, viewer.canEdit, viewer.isLoggedIn])

  const addBook = useCallback(async (bookId: string, source: 'click' | 'after_login') => {
    setError(null)
    const res = await fetch(`/api/signup-books/${encodeURIComponent(bookId)}`, { method: 'POST' })
    if (res.status === 409) {
      setContactsForBookId(bookId)
      return
    }
    if (!res.ok) {
      setError('Не удалось записаться на книгу. Попробуйте ещё раз.')
      return
    }
    setSelected((prev) => new Set(prev).add(bookId))
    track('collection_book_signup', { collection_id: collection.id, book_id: bookId, source })
    router.refresh()
  }, [collection.id, router])

  const removeBook = useCallback(async (bookId: string) => {
    setError(null)
    const res = await fetch(`/api/signup-books/${encodeURIComponent(bookId)}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Не удалось убрать книгу из списка. Попробуйте ещё раз.')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(bookId)
      return next
    })
    track('collection_book_unsignup', { collection_id: collection.id, book_id: bookId })
    router.refresh()
  }, [collection.id, router])

  useEffect(() => {
    if (!viewer.isLoggedIn || intentHandled.current) return
    intentHandled.current = true
    const bookId = consumeSignupIntent(ref)
    if (bookId && !selected.has(bookId)) void addBook(bookId, 'after_login')
  }, [viewer.isLoggedIn, ref, selected, addBook])

  function handleToggle(book: BookWithCover) {
    if (!viewer.isLoggedIn) {
      saveSignupIntent({ collectionRef: ref, bookId: book.id })
      track('auth_modal_opened', { trigger: 'collection_book_signup' })
      setAuthOpen(true)
      return
    }
    if (selected.has(book.id)) void removeBook(book.id)
    else void addBook(book.id, 'click')
  }

  async function handleSaveContacts(name: string, contacts: string) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contacts }),
    })
    if (!res.ok) throw new Error(`Profile save failed: ${res.status}`)
    const bookId = contactsForBookId
    setContactsForBookId(null)
    if (bookId) await addBook(bookId, 'click')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/collections/${ref}`)
    setCopied(true)
    track('collection_link_copied', { collection_id: collection.id })
    window.setTimeout(() => setCopied(false), 2000)
  }

  const cardProps = (book: BookWithCover, index: number) => ({
    book,
    isSelected: selected.has(book.id),
    onToggle: handleToggle,
    personalStatus: signupState?.personalStatuses[book.id] ?? null,
    position: index + 1,
    ignoreClubStatus: true,
  })

  return (
    <>
      <Header onSignIn={!viewer.isLoggedIn ? () => setAuthOpen(true) : undefined} isAdmin={viewer.isAdmin} displayName={signupState?.name} />
      <main className="collection-page" style={{ maxWidth: 760, margin: '0 auto', padding: '0 26px 44px' }}>
        {viewer.canEdit && collection.status !== 'published' && (
          <CollectionStatusBanner status={collection.status} reason={collection.moderationReason} />
        )}
        <section style={{ padding: '34px 0 20px', borderBottom: '1px solid var(--border-strong)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <span style={{ ...eyebrow, color: 'var(--accent)' }}>Подборка</span>
            <span style={{ ...eyebrow, color: 'var(--text-muted)' }}>{textsCount(books.length)}</span>
          </div>
          <h1 className="collection-title" style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em', textWrap: 'pretty', margin: 0 }}>
            {collection.title}
          </h1>
          <div className="collection-description" style={{ fontFamily: 'var(--nd-serif)', fontSize: 16, lineHeight: 1.65, color: 'var(--text-body)', marginTop: 16 }}>
            <SummaryMarkdown markdown={collection.descriptionMarkdown} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AuthorAvatar name={collection.displayName || '?'} size={28} />
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>Собрал:а <b style={{ fontWeight: 500 }}>{collection.displayName}</b></div>
                {changed && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>изменена {changed.relative} · {changed.absolute}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="p-btn ghost sm" onClick={copyLink} data-testid="collection-copy-link">
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              {viewer.canEdit && (
                <Link className="p-btn ghost sm" href={`/collections/${collection.id}/edit`}>Править</Link>
              )}
            </div>
          </div>
        </section>

        {error && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 14 }}>{error}</p>}

        <div className="catalog-desktop" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(206px, 1fr))', gap: 20, paddingTop: 22 }}>
          {books.map(({ book, hiddenFromCatalog }, index) => (
            <div key={book.id} data-testid="collection-item" style={{ display: 'flex', flexDirection: 'column' }}>
              <OrderLine index={index} hidden={hiddenFromCatalog} />
              <BookCard {...cardProps(book, index)} />
            </div>
          ))}
        </div>
        <div className="catalog-mobile" style={{ flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          {books.map(({ book, hiddenFromCatalog }, index) => (
            <div key={book.id} data-testid="collection-item-mobile">
              <OrderLine index={index} hidden={hiddenFromCatalog} />
              <BookCardMobile {...cardProps(book, index)} />
            </div>
          ))}
        </div>
      </main>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} callbackUrl={`/collections/${ref}`} entryPoint="collection_book_signup" />
      {contactsForBookId && (
        <ContactsForm
          defaultName={signupState?.name}
          defaultContacts={signupState?.contacts}
          onSave={handleSaveContacts}
          onClose={() => setContactsForBookId(null)}
        />
      )}
    </>
  )
}
```

> Классы `catalog-desktop` / `catalog-mobile` уже переключают видимость медиа-запросом в `app/globals.css`; если там задан `display: block` для мобильного — оставь как есть, `flexDirection` не повредит. Мобильные размеры заголовка (25px) — медиа-правило `.collection-title { font-size: 25px !important }` рядом с правилом из Task 3.
> Текст из спеки для окна входа («Чтобы записаться на книгу, войдите…»): если `AuthModal` не принимает свой заголовок, добавь в него необязательные пропсы `title?: string` и `description?: string` с текущими значениями по умолчанию и передай их отсюда. Проверь, что `e2e/auth.spec.ts` не завязан на текст заголовка.

```tsx
// app/collections/[slugOrId]/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadCollectionPageData, serializeCollection } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { canEditCollection } from '@/lib/collections/rules'
import { markdownExcerpt } from '@/lib/collections/format'
import { viewerFromSession } from '@/lib/collections/http'
import { getUserSignupState } from '@/lib/signup-books'
import CollectionPageClient from '@/components/nd/CollectionPageClient'

export const dynamic = 'force-dynamic'

type Params = { params: { slugOrId: string } }

async function loadOrNull(ref: string, viewer: { userId: string | null; isAdmin: boolean }) {
  try {
    return await loadCollectionPageData(ref, viewer)
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return null
    throw error
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await loadOrNull(params.slugOrId, { userId: null, isAdmin: false })
  if (!data?.record.slug) return {}
  const { record } = data
  const title = `${record.title} — подборка`
  const description = markdownExcerpt(record.descriptionMarkdown, 200)
  const version = (record.editedAt ?? record.publishedAt ?? record.updatedAt).getTime()
  const image = { url: `/api/og/collections/${record.slug}?v=${version}`, width: 1200, height: 630 }
  return {
    title: `${title} · Долгое наступление`,
    description,
    alternates: { canonical: `/collections/${record.slug}` },
    openGraph: { title, description, url: `/collections/${record.slug}`, siteName: 'Долгое наступление', locale: 'ru_RU', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export default async function CollectionPage({ params }: Params) {
  const session = await auth()
  const viewer = viewerFromSession(session)
  const data = await loadOrNull(params.slugOrId, viewer)
  if (!data) notFound()
  const { record, books } = data
  if (record.slug && params.slugOrId !== record.slug) redirect(`/collections/${record.slug}`)
  const signupState = viewer.userId ? await getUserSignupState(viewer.userId) : null
  return (
    <CollectionPageClient
      collection={serializeCollection(record)}
      books={books}
      viewer={{ isLoggedIn: Boolean(viewer.userId), isAdmin: viewer.isAdmin, canEdit: canEditCollection(record, viewer) }}
      signupState={signupState}
    />
  )
}
```

- [ ] **Step 4: Прогон** `npx jest components/nd/CollectionPageClient` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/CollectionStatusBanner.tsx components/nd/CollectionPageClient.tsx components/nd/CollectionPageClient.test.tsx "app/collections/[slugOrId]/page.tsx" components/nd/AuthModal.tsx app/globals.css
git commit -m "feat(collections): страница подборки с записью на книги"
```

---

### Task 5: Редактор

**Files:**
- Create: `components/nd/useCollectionAutosave.ts`, `components/nd/useCollectionAutosave.test.tsx`, `components/nd/CollectionBookSearch.tsx`, `components/nd/CollectionBookSearch.test.tsx`, `components/nd/CollectionEditor.tsx`, `components/nd/CollectionEditor.test.tsx`, `app/collections/new/page.tsx`, `app/collections/[slugOrId]/edit/page.tsx`

**Interfaces:**
- Consumes: `POST /api/me/collections`, `PATCH /api/me/collections/[id]`, `POST .../submit`, `DELETE /api/me/collections/[id]`, `PATCH /api/admin/collections/[id]`, `GET /api/collections/book-search`, `loadCollectionById`, `loadEditorBooks`, `collectionIssueText`, `COLLECTION_LIMITS`
- Produces: `useCollectionAutosave({ initialId, content, enabled, delayMs?, onCreated? }) → { id, state: 'idle' | 'saving' | 'saved' | 'error', issues: string[], flush(): Promise<void> }`; `<CollectionBookSearch excludeIds onAdd />`; `<CollectionEditor mode initial initialBooks onSaved? onCancel? />` (PR 3 использует `mode="admin"`)

- [ ] **Step 1: Тесты**

```tsx
// components/nd/useCollectionAutosave.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { useCollectionAutosave } from './useCollectionAutosave'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

const content = (title: string) => ({ title, descriptionMarkdown: '', displayName: '', bookIds: [] })
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  jest.useFakeTimers()
  global.fetch = jest.fn() as never
})
afterEach(() => jest.useRealTimers())

it('без названия черновик не создаётся', async () => {
  renderHook(() => useCollectionAutosave({ initialId: null, content: content(''), enabled: true }))
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(global.fetch).not.toHaveBeenCalled()
})

it('создаёт черновик, затем сохраняет содержимое', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ collection: { id: 'c1' } })).mockResolvedValueOnce(ok({ collection: { id: 'c1' } }))
  const onCreated = jest.fn()
  const { result, rerender } = renderHook(({ c }) => useCollectionAutosave({ initialId: null, content: c, enabled: true, onCreated }), { initialProps: { c: content('') } })
  rerender({ c: content('Тема') })
  await act(async () => { jest.advanceTimersByTime(900) })
  expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/me/collections', expect.objectContaining({ method: 'POST' }))
  expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/me/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(onCreated).toHaveBeenCalledWith('c1')
  expect(result.current.state).toBe('saved')
})

it('ошибка валидации попадает в issues', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'validation', issues: ['title_too_long'] }) })
  const { result } = renderHook(() => useCollectionAutosave({ initialId: 'c1', content: content('x'), enabled: true }))
  await act(async () => { jest.advanceTimersByTime(900) })
  expect(result.current.issues).toEqual(['title_too_long'])
})

it('выключенное автосохранение ничего не шлёт', async () => {
  renderHook(() => useCollectionAutosave({ initialId: 'c1', content: content('Тема'), enabled: false }))
  await act(async () => { jest.advanceTimersByTime(2000) })
  expect(global.fetch).not.toHaveBeenCalled()
})
```

```tsx
// components/nd/CollectionBookSearch.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CollectionBookSearch from './CollectionBookSearch'

jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const found = { id: 'b1', title: 'Долг', author: 'Гребер', coverUrl: null, year: '2011', isArticle: false, clubStatus: null }

beforeEach(() => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ books: [found, { ...found, id: 'b2', title: 'Уже есть' }] }) }) as never
})
afterEach(() => jest.useRealTimers())

it('показывает найденное без уже добавленных и добавляет по клику', async () => {
  const onAdd = jest.fn()
  render(<CollectionBookSearch excludeIds={new Set(['b2'])} onAdd={onAdd} />)
  fireEvent.change(screen.getByPlaceholderText('Найти книгу по названию или автору'), { target: { value: 'до' } })
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(screen.queryByText('Уже есть')).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: /Долг/ }))
  expect(onAdd).toHaveBeenCalledWith(found)
})

it('пустой результат объясняет, что делать', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ books: [] }) })
  render(<CollectionBookSearch excludeIds={new Set()} onAdd={jest.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Найти книгу по названию или автору'), { target: { value: 'нет такой' } })
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(screen.getByText(/сначала предложите её в каталоге/)).toBeInTheDocument()
})
```

```tsx
// components/nd/CollectionEditor.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CollectionEditor from './CollectionEditor'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header /> }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./MarkdownToolbar', () => ({ __esModule: true, default: () => <div /> }))
jest.mock('./CollectionBookSearch', () => ({ __esModule: true, default: () => <input placeholder="search" /> }))

const book = (id: string, extra = {}) => ({ id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, year: '2020', isArticle: false, clubStatus: null, hiddenFromCatalog: false, ...extra })
const base = {
  id: 'c1', slug: null, authorUserId: 'u', displayName: 'Аня', title: 'Тема', descriptionMarkdown: 'Описание',
  status: 'draft' as const, moderationReason: null, bookIds: ['a', 'b'],
  submittedAt: null, editedAt: null, publishedAt: null, reviewedAt: null, reviewedSnapshot: null,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ collection: base }) }) as never
})

it('стрелки меняют порядок, крайние неактивны', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  const up = screen.getAllByRole('button', { name: 'Выше' })
  expect(up[0]).toBeDisabled()
  fireEvent.click(up[1])
  expect(screen.getAllByTestId('collection-book-row')[0]).toHaveTextContent('Книга b')
})

it('приписки клуба и скрытой книги видны только в редакторе', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a', { clubStatus: 'read' }), book('b', { hiddenFromCatalog: true })]} />)
  expect(screen.getByText(/клуб уже читал/)).toBeInTheDocument()
  expect(screen.getByText(/скрыта из каталога/)).toBeInTheDocument()
})

it('неопубликованная: «Отправить на проверку», удаление доступно', () => {
  render(<CollectionEditor mode="author" initial={base} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Удалить подборку' })).toBeInTheDocument()
})

it('отправка недоступна без подписи', () => {
  render(<CollectionEditor mode="author" initial={{ ...base, displayName: '' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeDisabled()
})

it('опубликованная: без удаления, «Опубликовать правки» активна только после изменений', async () => {
  render(<CollectionEditor mode="author" initial={{ ...base, status: 'published', slug: 'tema' }} initialBooks={[book('a'), book('b')]} />)
  expect(screen.queryByRole('button', { name: 'Удалить подборку' })).toBeNull()
  const publish = screen.getByRole('button', { name: 'Опубликовать правки' })
  expect(publish).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Новая тема' } })
  expect(publish).toBeEnabled()
  await act(async () => { fireEvent.click(publish) })
  expect(global.fetch).toHaveBeenCalledWith('/api/me/collections/c1', expect.objectContaining({ method: 'PATCH' }))
})

it('админ сохраняет через админский роут', async () => {
  const onSaved = jest.fn()
  render(<CollectionEditor mode="admin" initial={{ ...base, status: 'pending' }} initialBooks={[book('a'), book('b')]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Правка' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1', expect.objectContaining({ method: 'PATCH' }))
  expect(onSaved).toHaveBeenCalled()
})
```

- [ ] **Step 2: Прогон — падают**

- [ ] **Step 3: Реализация**

```ts
// components/nd/useCollectionAutosave.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionSnapshot } from '@/lib/collections/types'
import { track } from '@/lib/analytics'

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Options {
  initialId: string | null
  content: CollectionSnapshot
  enabled: boolean
  delayMs?: number
  onCreated?: (id: string) => void
}

function issuesFrom(error: unknown): string[] {
  if (error && typeof error === 'object') {
    const body = error as { error?: unknown; issues?: unknown }
    if (Array.isArray(body.issues)) return body.issues.filter((i): i is string => typeof i === 'string')
    if (typeof body.error === 'string') return [body.error]
  }
  return ['collections_failed']
}

export function useCollectionAutosave({ initialId, content, enabled, delayMs = 800, onCreated }: Options) {
  const [id, setId] = useState(initialId)
  const [state, setState] = useState<AutosaveState>('idle')
  const [issues, setIssues] = useState<string[]>([])
  const contentKey = JSON.stringify(content)
  const latestKey = useRef(contentKey)
  const savedKey = useRef(contentKey)
  const idRef = useRef(initialId)
  const inFlight = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  latestKey.current = contentKey

  const save = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      again.current = true
      return inFlight.current
    }
    const run = async () => {
      const key = latestKey.current
      const snapshot = JSON.parse(key) as CollectionSnapshot
      if (key === savedKey.current) return
      if (!idRef.current && !snapshot.title.trim()) return
      setState('saving')
      try {
        if (!idRef.current) {
          const res = await fetch('/api/me/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: snapshot.title }),
          })
          const body = await res.json()
          if (!res.ok) throw body
          idRef.current = body.collection.id as string
          setId(idRef.current)
          onCreated?.(idRef.current)
          track('collection_created', { collection_id: idRef.current })
        }
        const res = await fetch(`/api/me/collections/${idRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: key,
        })
        const body = await res.json()
        if (!res.ok) throw body
        savedKey.current = key
        setIssues([])
        setState('saved')
      } catch (error) {
        setIssues(issuesFrom(error))
        setState('error')
      }
    }
    inFlight.current = run().finally(() => { inFlight.current = null })
    await inFlight.current
    if (again.current) {
      again.current = false
      await save()
    }
  }, [onCreated])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(() => { void save() }, delayMs)
    return () => window.clearTimeout(timer)
  }, [enabled, delayMs, save, contentKey])

  const flush = useCallback(async () => {
    await save()
  }, [save])

  return { id, state, issues, flush }
}
```

```tsx
// components/nd/CollectionBookSearch.tsx
'use client'

import { useEffect, useState } from 'react'
import type { CollectionBookSearchResult } from '@/lib/collections/types'
import CoverImage from './CoverImage'

interface Props {
  excludeIds: ReadonlySet<string>
  onAdd: (book: CollectionBookSearchResult) => void
}

export default function CollectionBookSearch({ excludeIds, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CollectionBookSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/collections/book-search?q=${encodeURIComponent(q)}`)
        const body = await res.json()
        if (!cancelled) setResults(res.ok ? body.books : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q])

  const visible = results.filter((book) => !excludeIds.has(book.id)).slice(0, 6)
  const showEmpty = q.length >= 2 && !loading && visible.length === 0

  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти книгу по названию или автору"
        aria-label="Найти книгу"
        style={{
          width: '100%', fontFamily: 'var(--nd-sans)', fontSize: 14, color: 'var(--text)', background: 'var(--bg-input)',
          border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '10px 12px', outline: 'none',
        }}
      />
      {(visible.length > 0 || showEmpty) && (
        <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, maxHeight: 250, overflow: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border-strong)' }}>
          {visible.map((book) => (
            <button
              key={book.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onAdd(book); setQuery('') }}
              style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '9px 11px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontFamily: 'var(--nd-sans)' }}
            >
              <span style={{ width: 24, flex: 'none', aspectRatio: '2 / 3', overflow: 'hidden' }}>
                <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text)' }}>{book.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {book.author}{book.year ? `, ${book.year}` : ''}{book.isArticle ? ' · статья' : ''}
                </span>
              </span>
            </button>
          ))}
          {showEmpty && (
            <div style={{ padding: '12px 13px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              В каталоге такой книги нет. В подборку можно добавить только книги из каталога — сначала предложите её в каталоге и дождитесь, пока её опубликуют.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

```tsx
// components/nd/CollectionEditor.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorBook, SerializedCollection } from '@/lib/collections/types'
import { COLLECTION_LIMITS } from '@/lib/collections/types'
import { collectionIssueText, textsCount } from '@/lib/collections/format'
import { track } from '@/lib/analytics'
import MarkdownToolbar from './MarkdownToolbar'
import CoverImage from './CoverImage'
import CollectionBookSearch from './CollectionBookSearch'
import { useCollectionAutosave } from './useCollectionAutosave'
import { COLLECTION_STATUS_LABEL } from './collection-status'

interface Props {
  mode: 'author' | 'admin'
  initial: SerializedCollection | null
  initialBooks: EditorBook[]
  onSaved?: (collection: SerializedCollection) => void
  onCancel?: () => void
}

const label: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)', marginBottom: 7 }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textTransform: 'none', letterSpacing: 0 }
const field: React.CSSProperties = { marginBottom: 20 }

function clubNote(book: EditorBook): string {
  if (book.clubStatus === 'read') return ' · клуб уже читал'
  if (book.clubStatus === 'reading') return ' · клуб читает сейчас'
  return ''
}

export default function CollectionEditor({ mode, initial, initialBooks, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.descriptionMarkdown ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [books, setBooks] = useState<EditorBook[]>(initialBooks)
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [baseline, setBaseline] = useState(() => JSON.stringify({
    title: initial?.title ?? '', descriptionMarkdown: initial?.descriptionMarkdown ?? '',
    displayName: initial?.displayName ?? '', bookIds: initialBooks.map((b) => b.id),
  }))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const status = initial?.status ?? 'draft'
  const isPublished = status === 'published'
  const autosave = mode === 'author' && !isPublished
  const content = useMemo(() => ({ title, descriptionMarkdown: description, displayName, bookIds: books.map((b) => b.id) }), [title, description, displayName, books])
  const dirty = JSON.stringify(content) !== baseline

  const auto = useCollectionAutosave({
    initialId: initial?.id ?? null,
    content,
    enabled: autosave,
    // replaceState, а не router.replace: смена маршрута перемонтировала бы редактор и сбросила ввод.
    onCreated: (id) => window.history.replaceState(null, '', `/collections/${id}/edit`),
  })
  const collectionId = auto.id

  useEffect(() => {
    if (autosave || !dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [autosave, dirty])

  const publicCount = books.filter((b) => !b.hiddenFromCatalog).length
  const canSubmit = Boolean(collectionId) && title.trim() !== '' && description.trim() !== '' && displayName.trim() !== ''
    && publicCount >= COLLECTION_LIMITS.booksMinToSubmit && auto.state !== 'saving' && !busy
  const issues = [...auto.issues, ...serverIssues]

  function move(index: number, delta: number) {
    setBooks((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function explicitSave() {
    if (!collectionId) return
    setBusy(true)
    setServerIssues([])
    try {
      const url = mode === 'admin' ? `/api/admin/collections/${collectionId}` : `/api/me/collections/${collectionId}`
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) })
      const body = await res.json()
      if (!res.ok) {
        setServerIssues(Array.isArray(body.issues) ? body.issues : [body.error ?? 'collections_failed'])
        return
      }
      setBaseline(JSON.stringify(content))
      if (mode === 'author') track('collection_edits_published', { collection_id: collectionId })
      onSaved?.(body.collection)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!collectionId) return
    setBusy(true)
    setServerIssues([])
    try {
      await auto.flush()
      const res = await fetch(`/api/me/collections/${collectionId}/submit`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setServerIssues(Array.isArray(body.issues) ? body.issues : [body.error ?? 'collections_failed'])
        return
      }
      track('collection_submitted', { collection_id: collectionId })
      window.location.assign(`/collections/${collectionId}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!collectionId || !window.confirm('Удалить подборку? Это нельзя отменить.')) return
    const res = await fetch(`/api/me/collections/${collectionId}`, { method: 'DELETE' })
    if (res.ok) window.location.assign('/collections')
  }

  const stateLine = mode === 'admin'
    ? `${COLLECTION_STATUS_LABEL[status]} · правка владельцем`
    : isPublished
      ? 'Опубликована — правки уходят на сайт без проверки'
      : `${status === 'draft' ? 'Черновик' : COLLECTION_STATUS_LABEL[status]} · сохраняется автоматически`

  return (
    <div className="collection-editor" style={{ maxWidth: 880, margin: '0 auto', padding: mode === 'admin' ? 0 : '24px 26px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>
            {initial ? 'Правка подборки' : 'Новая подборка'}
          </span>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            {stateLine}
            {autosave && (
              <span data-testid="collection-save-state" style={{ marginLeft: 8 }}>
                {auto.state === 'saving' ? 'Сохраняю…' : auto.state === 'saved' ? 'Сохранено' : auto.state === 'error' ? 'Не сохранено' : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {collectionId && mode === 'author' && (
            <a className="p-btn ghost sm" href={`/collections/${collectionId}`}>Посмотреть</a>
          )}
          {mode === 'author' && !isPublished && (
            <button type="button" className="p-btn sm" onClick={submit} disabled={!canSubmit}>Отправить на проверку</button>
          )}
          {(mode === 'admin' || isPublished) && (
            <>
              <button
                type="button"
                className="p-btn ghost sm"
                disabled={!dirty || busy}
                onClick={() => {
                  const b = JSON.parse(baseline)
                  setTitle(b.title); setDescription(b.descriptionMarkdown); setDisplayName(b.displayName)
                  setBooks((prev) => b.bookIds.map((id: string) => prev.find((x) => x.id === id) ?? initialBooks.find((x) => x.id === id)).filter(Boolean))
                  onCancel?.()
                }}
              >
                {mode === 'admin' ? 'Отмена' : 'Отменить правки'}
              </button>
              <button type="button" className="p-btn sm" onClick={explicitSave} disabled={!dirty || busy}>
                {mode === 'admin' ? 'Сохранить' : 'Опубликовать правки'}
              </button>
            </>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div data-testid="collection-editor-issues" style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10, marginBottom: 18, fontSize: 12, color: 'var(--text-body)' }}>
          {Array.from(new Set(issues)).map((issue) => <div key={issue}>{collectionIssueText(issue)}</div>)}
        </div>
      )}

      <div style={field}>
        <label htmlFor="collection-title" style={label}><span>Название</span><span style={hint}>{title.length} / {COLLECTION_LIMITS.titleMax}</span></label>
        <input
          id="collection-title"
          value={title}
          maxLength={COLLECTION_LIMITS.titleMax}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="О чём эта подборка в трёх словах"
          className="collection-title-input"
          style={{ width: '100%', fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 26, border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 0', outline: 'none', color: 'var(--text)', background: 'transparent' }}
        />
      </div>

      <div style={field}>
        <label htmlFor="collection-description" style={label}><span>Описание</span></label>
        <MarkdownToolbar textareaRef={textareaRef} value={description} onChange={setDescription} />
        <textarea
          id="collection-description"
          ref={textareaRef}
          value={description}
          maxLength={COLLECTION_LIMITS.descriptionMax}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          style={{ width: '100%', fontFamily: 'var(--nd-serif)', fontSize: 15, lineHeight: 1.6, color: 'var(--text-body)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: 11, outline: 'none', resize: 'vertical', minHeight: 110, background: 'var(--bg-input)', marginTop: 7 }}
        />
        <div style={hint}>Зачем вы это собрали и как это читать. Можно списками, выделением и ссылками. Начало описания попадёт в превью ссылки в Telegram.</div>
      </div>

      <div style={field}>
        <label htmlFor="collection-display-name" style={label}><span>Подпись</span></label>
        <input
          id="collection-display-name"
          value={displayName}
          maxLength={COLLECTION_LIMITS.displayNameMax}
          onChange={(event) => setDisplayName(event.target.value)}
          style={{ width: '100%', maxWidth: 320, fontFamily: 'var(--nd-sans)', fontSize: 14, color: 'var(--text)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '10px 12px', outline: 'none' }}
        />
        <div style={hint}>Как вас подписать на странице подборки</div>
      </div>

      <div style={{ ...field, marginTop: 30 }}>
        <div style={label}>
          <span>Тексты · {books.length}</span>
          {publicCount < COLLECTION_LIMITS.booksMinToSubmit && <span style={hint}>нужно минимум два</span>}
        </div>
        {books.length < COLLECTION_LIMITS.booksMax && (
          <CollectionBookSearch
            excludeIds={new Set(books.map((b) => b.id))}
            onAdd={(book) => setBooks((prev) => [...prev, { ...book, hiddenFromCatalog: false }])}
          />
        )}
        {books.length === 0 && (
          <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Пока пусто. Найдите книги, которые уже выбрали в каталоге.
          </div>
        )}
        {books.map((book, index) => (
          <div key={book.id} data-testid="collection-book-row" style={{ display: 'grid', gridTemplateColumns: '26px 44px 1fr auto', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              {(['Выше', 'Ниже'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  disabled={name === 'Выше' ? index === 0 : index === books.length - 1}
                  onClick={() => move(index, name === 'Выше' ? -1 : 1)}
                  style={{ width: 22, height: 18, border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: 9, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {name === 'Выше' ? '▲' : '▼'}
                </button>
              ))}
            </div>
            <div style={{ width: 44, aspectRatio: '2 / 3', overflow: 'hidden' }}>
              <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15 }}>{book.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {book.author}{book.year ? `, ${book.year}` : ''}{clubNote(book)}
                {book.hiddenFromCatalog && <span style={{ color: 'var(--accent)' }}> · скрыта из каталога</span>}
              </span>
            </div>
            <button type="button" className="p-link muted" onClick={() => setBooks((prev) => prev.filter((b) => b.id !== book.id))}>Убрать</button>
          </div>
        ))}
        <div style={hint}>{textsCount(books.length)}</div>
      </div>

      {mode === 'author' && !isPublished && collectionId && (
        <div style={{ display: 'flex', paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 18 }}>
          <button type="button" onClick={remove} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', padding: 0 }}>
            Удалить подборку
          </button>
        </div>
      )}
    </div>
  )
}
```

```tsx
// app/collections/new/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import CollectionEditorPage from '@/components/nd/CollectionEditorPage'

export const dynamic = 'force-dynamic'

export default async function NewCollectionPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/collections?create=1')
  return <CollectionEditorPage isAdmin={Boolean(session.user.isAdmin)} initial={null} initialBooks={[]} />
}
```

```tsx
// app/collections/[slugOrId]/edit/page.tsx
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadCollectionById, loadEditorBooks, serializeCollection } from '@/lib/collections/repo'
import { isCollectionOwner } from '@/lib/collections/rules'
import { viewerFromSession } from '@/lib/collections/http'
import CollectionEditorPage from '@/components/nd/CollectionEditorPage'

export const dynamic = 'force-dynamic'

export default async function EditCollectionPage({ params }: { params: { slugOrId: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect(`/collections/${params.slugOrId}`)
  const record = await loadCollectionById(params.slugOrId).catch(() => null)
  if (!record) notFound()
  const viewer = viewerFromSession(session)
  if (!isCollectionOwner(record, viewer)) {
    if (viewer.isAdmin) redirect(`/admin?view=collections&collection=${record.id}`)
    notFound()
  }
  const books = await loadEditorBooks(record.bookIds)
  return <CollectionEditorPage isAdmin={viewer.isAdmin} initial={serializeCollection(record)} initialBooks={books} />
}
```

Обёртка с шапкой (клиентская, чтобы страницы оставались серверными):

```tsx
// components/nd/CollectionEditorPage.tsx
'use client'

import type { EditorBook, SerializedCollection } from '@/lib/collections/types'
import Header from './Header'
import CollectionEditor from './CollectionEditor'

export default function CollectionEditorPage(props: { isAdmin: boolean; initial: SerializedCollection | null; initialBooks: EditorBook[] }) {
  return (
    <>
      <Header isAdmin={props.isAdmin} />
      <CollectionEditor mode="author" initial={props.initial} initialBooks={props.initialBooks} />
    </>
  )
}
```

> Формат `?view=collections` сверь с тем, как `AdminPanel` читает вкладку из адреса (`components/nd/AdminPanel.tsx:921`, `e2e/admin-tabs-query.spec.ts`); параметр `collection` читает `AdminCollectionsPanel` в PR 3.

- [ ] **Step 4: Прогон** `npx jest components/nd/useCollectionAutosave components/nd/CollectionBookSearch components/nd/CollectionEditor` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/useCollectionAutosave.ts components/nd/useCollectionAutosave.test.tsx components/nd/CollectionBookSearch.tsx components/nd/CollectionBookSearch.test.tsx components/nd/CollectionEditor.tsx components/nd/CollectionEditor.test.tsx components/nd/CollectionEditorPage.tsx app/collections/new "app/collections/[slugOrId]/edit"
git commit -m "feat(collections): редактор с автосохранением черновика и правками опубликованной"
```

---

### Task 6: Вкладка «Подборки» в профиле

**Files:**
- Create: `components/nd/ProfileCollectionsTab.tsx`, `components/nd/ProfileCollectionsTab.test.tsx`
- Modify: `components/nd/ProfileDrawer.tsx`

**Interfaces:**
- Consumes: `GET /api/me/collections`, `POST /api/me/collections/[id]/submit`, `formatChangedAt`, `textsCount`, `collectionIssueText`, `collection-status.ts`

- [ ] **Step 1: Тест**

```tsx
// components/nd/ProfileCollectionsTab.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import ProfileCollectionsTab from './ProfileCollectionsTab'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const item = (overrides: Record<string, unknown>) => ({
  id: 'c', slug: null, title: 'Тема', status: 'draft', moderationReason: null, textsCount: 2, covers: [],
  changedAt: '2026-09-13T09:00:00Z', submittedAt: null, ...overrides,
})

function mockList(collections: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ collections }) }) as never
}

it('пусто — приглашение собрать', async () => {
  mockList([])
  await act(async () => { render(<ProfileCollectionsTab />) })
  expect(screen.getByText(/Вы ещё не собирали подборок/)).toBeInTheDocument()
})

it('кнопки по статусам и причина', async () => {
  mockList([
    item({ id: 'd', status: 'draft' }),
    item({ id: 'p', status: 'published', slug: 'tema' }),
    item({ id: 'r', status: 'rejected', moderationReason: 'Мало текста' }),
  ])
  await act(async () => { render(<ProfileCollectionsTab />) })
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', '/collections/tema')
  expect(screen.getByRole('button', { name: 'Отправить снова' })).toBeInTheDocument()
  expect(screen.getByText(/Почему не опубликовали:/)).toBeInTheDocument()
  expect(screen.getByText('Мало текста')).toBeInTheDocument()
})

it('ошибка отправки показывает текст проблемы', async () => {
  mockList([item({ id: 'd', status: 'draft' })])
  await act(async () => { render(<ProfileCollectionsTab />) })
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'validation', issues: ['too_few_books'] }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отправить' })) })
  expect(screen.getByText('Нужно минимум два текста из каталога')).toBeInTheDocument()
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/ProfileCollectionsTab.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MyCollectionItem } from '@/lib/collections/types'
import { collectionIssueText, formatChangedAt, textsCount } from '@/lib/collections/format'
import { track } from '@/lib/analytics'
import CoverImage from './CoverImage'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_COLOR, COLLECTION_STATUS_LABEL } from './collection-status'

export default function ProfileCollectionsTab() {
  const [items, setItems] = useState<MyCollectionItem[] | null>(null)
  const [issuesById, setIssuesById] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/me/collections')
    const body = await res.json()
    setItems(res.ok ? body.collections : [])
  }, [])

  useEffect(() => { void load() }, [load])

  async function submit(id: string) {
    const res = await fetch(`/api/me/collections/${id}/submit`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      setIssuesById((prev) => ({ ...prev, [id]: Array.isArray(body.issues) ? body.issues : [body.error] }))
      return
    }
    track('collection_submitted', { collection_id: id, source: 'profile' })
    setIssuesById((prev) => ({ ...prev, [id]: [] }))
    await load()
  }

  if (items === null) return <div style={{ padding: '1.25rem 1.5rem', fontSize: 12, color: 'var(--text-muted)' }}>Загружаю…</div>

  const createButton = <a href="/collections/new" className="p-btn block sm" style={{ textAlign: 'center' }}>Собрать подборку</a>

  if (items.length === 0) {
    return (
      <div style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
            Вы ещё не собирали подборок. Если дочитали книгу с кругом и знаете, что читать дальше, — соберите набросок.
          </p>
          {createButton}
        </div>
      </div>
    )
  }

  const now = new Date()
  return (
    <div style={{ padding: '1.25rem 1.5rem' }} data-testid="profile-collections">
      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 14px' }}>Опубликованные подборки правятся без проверки</p>
      {createButton}
      <div style={{ marginTop: 14 }}>
        {items.map((item, index) => {
          const prefix = COLLECTION_REASON_PREFIX[item.status]
          const when = item.status === 'pending' && item.submittedAt
            ? `отправлена ${formatChangedAt(new Date(item.submittedAt), now).absolute}`
            : `изменена ${formatChangedAt(new Date(item.changedAt), now).relative}`
          return (
            <div key={item.id} data-testid="profile-collection-row" style={{ borderTop: `1px solid ${index === 0 ? 'var(--border-strong)' : 'var(--border)'}`, padding: '14px 0' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: COLLECTION_STATUS_COLOR[item.status], borderBottom: '1px solid currentColor', paddingBottom: 2 }}>
                  {COLLECTION_STATUS_LABEL[item.status]}
                </span>
                <span style={{ fontSize: 10.4, color: 'var(--text-muted)' }}>{when}</span>
              </div>
              <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15, lineHeight: 1.24, margin: '7px 0 5px' }}>{item.title}</div>
              <div style={{ fontSize: 10.4, color: 'var(--text-muted)' }}>{textsCount(item.textsCount)}</div>
              <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                {item.covers.map((cover) => (
                  <span key={cover.id} style={{ width: 20, aspectRatio: '2 / 3', overflow: 'hidden' }}>
                    <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
                  </span>
                ))}
              </div>
              {prefix && item.moderationReason && (
                <div style={{ marginTop: 10, borderLeft: '2px solid var(--accent)', paddingLeft: 10, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-body)' }}>
                  <b style={{ fontWeight: 500 }}>{prefix}</b> {item.moderationReason}
                </div>
              )}
              {(issuesById[item.id] ?? []).map((issue) => (
                <div key={issue} style={{ marginTop: 6, fontSize: 11.5, color: 'var(--accent)' }}>{collectionIssueText(issue)}</div>
              ))}
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                <a className="p-btn ghost sm" href={`/collections/${item.id}/edit`}>Править</a>
                {item.status === 'published' && item.slug && <a className="p-btn ghost sm" href={`/collections/${item.slug}`}>Открыть</a>}
                {item.status === 'draft' && <button type="button" className="p-btn sm" onClick={() => submit(item.id)}>Отправить</button>}
                {(item.status === 'rejected' || item.status === 'hidden') && (
                  <button type="button" className="p-btn sm" onClick={() => submit(item.id)}>Отправить снова</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

`components/nd/ProfileDrawer.tsx`:

```tsx
import ProfileCollectionsTab from './ProfileCollectionsTab'

type Tab = 'signup' | 'submitted' | 'collections' | 'profile'

// в ряду вкладок:
{(['signup', 'submitted', 'collections', 'profile'] as Tab[]).map(tab => {
  const labels: Record<Tab, string> = {
    signup: 'Мои книги',
    submitted: 'Предложил:а',
    collections: 'Подборки',
    profile: 'Профиль',
  }
  // ...без изменений
})}

// контейнер ряда вкладок: добавить overflowX: 'auto' к существующему style; кнопкам — whiteSpace: 'nowrap'.

// рядом с другими телами вкладок:
{activeTab === 'collections' && <ProfileCollectionsTab />}
```

Проверь существующие тесты `components/nd/ProfileDrawer*.test.tsx`: если какой-то проверяет число вкладок или их порядок — обнови ожидание (добавилась «Подборки» третьей). Событие `profile_tab_opened` получит `tab: 'collections'` автоматически.

- [ ] **Step 4: Прогон** `npx jest components/nd/ProfileCollectionsTab components/nd/ProfileDrawer` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/ProfileCollectionsTab.tsx components/nd/ProfileCollectionsTab.test.tsx components/nd/ProfileDrawer.tsx components/nd/ProfileDrawer*.test.tsx
git commit -m "feat(collections): вкладка «Подборки» в личном кабинете"
```

---

### Task 7: Картинка превью ссылки

**Files:**
- Create: `lib/collections/og.ts`, `lib/collections/og.test.ts`, `app/api/og/collections/[slug]/route.tsx`

**Interfaces:**
- Produces: `OG_COLORS`, `fetchCoverDataUrl(url, timeoutMs?, fetchImpl?): Promise<string | null>`, `authorInitials(author): string`; `GET /api/og/collections/[slug]`

- [ ] **Step 1: Тест**

```ts
// lib/collections/og.test.ts
/**
 * @jest-environment node
 */
import { authorInitials, fetchCoverDataUrl } from './og'

const response = (type: string, ok = true) => ({
  ok,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}) as never

describe('fetchCoverDataUrl', () => {
  it('png и jpeg превращаются в data URL', async () => {
    await expect(fetchCoverDataUrl('https://x/c.png', 100, async () => response('image/png'))).resolves.toBe('data:image/png;base64,AQID')
    await expect(fetchCoverDataUrl('https://x/c.jpg', 100, async () => response('image/jpeg; charset=binary'))).resolves.toMatch(/^data:image\/jpeg/)
  })
  it('другие форматы, ошибки и пустой адрес — null', async () => {
    await expect(fetchCoverDataUrl('https://x/c.webp', 100, async () => response('image/webp'))).resolves.toBeNull()
    await expect(fetchCoverDataUrl('https://x/c.png', 100, async () => response('image/png', false))).resolves.toBeNull()
    await expect(fetchCoverDataUrl(null)).resolves.toBeNull()
  })
  it('долгая загрузка обрывается по таймауту', async () => {
    const hanging = (_url: string, init?: RequestInit) => new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
    await expect(fetchCoverDataUrl('https://x/slow.png', 20, hanging as never)).resolves.toBeNull()
  })
})

describe('authorInitials', () => {
  it('две первые буквы', () => {
    expect(authorInitials('David Wengrow, David Graeber')).toBe('DW')
    expect(authorInitials('Гайдар')).toBe('Г')
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/og.ts
/** В ImageResponse CSS-переменные не работают: значения скопированы из app/globals.css. */
export const OG_COLORS = {
  bg: '#F9F5EE', // --bg
  text: '#111111', // --text
  muted: '#999999', // --text-muted
  accent: '#C0603A', // --accent
  border: '#E5E5E5', // --border
  coverFallback: '#EDE5D8', // --bg-elevated
} as const

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg'])

export async function fetchCoverDataUrl(
  url: string | null,
  timeoutMs = 2500,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(type)) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function authorInitials(author: string): string {
  return author.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('')
}
```

```tsx
// app/api/og/collections/[slug]/route.tsx
import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { loadCollectionPageData } from '@/lib/collections/repo'
import { textsCount } from '@/lib/collections/format'
import { OG_COLORS, authorInitials, fetchCoverDataUrl } from '@/lib/collections/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await loadCollectionPageData(params.slug, { userId: null, isAdmin: false }).catch(() => null)
  if (!data || data.record.slug !== params.slug) {
    return NextResponse.redirect(new URL('/api/og', req.url))
  }
  const covers = await Promise.all(
    data.books.slice(0, 5).map(async ({ book }) => ({ id: book.id, author: book.author, src: await fetchCoverDataUrl(book.coverUrl) })),
  )

  return new ImageResponse(
    (
      <div style={{ width: '1200px', height: '630px', display: 'flex', background: OG_COLORS.bg, padding: '64px 72px', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '1000px' }}>
          <div style={{ display: 'flex', fontFamily: 'serif', fontSize: '20px', letterSpacing: '0.16em', textTransform: 'uppercase', color: OG_COLORS.accent, marginBottom: '22px' }}>
            {`Подборка · ${textsCount(data.books.length)}`}
          </div>
          <div style={{ display: 'flex', fontFamily: 'serif', fontWeight: 700, fontSize: '64px', lineHeight: 1.08, color: OG_COLORS.text, maxHeight: '210px', overflow: 'hidden' }}>
            {data.record.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '210px' }}>
            {covers.map((cover, index) => (
              <div key={cover.id} style={{ display: 'flex', width: '140px', height: '210px', marginLeft: index === 0 ? '0' : '-44px', borderRight: `2px solid ${OG_COLORS.border}`, background: OG_COLORS.coverFallback, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {cover.src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={cover.src} width={140} height={210} style={{ objectFit: 'cover' }} alt="" />
                  : <div style={{ display: 'flex', fontFamily: 'serif', fontWeight: 700, fontSize: '40px', color: OG_COLORS.muted }}>{authorInitials(cover.author)}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontFamily: 'serif', fontSize: '26px', color: OG_COLORS.muted }}>Долгое наступление</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
```

> `app/api/**/*.tsx` не входит в `collectCoverageFrom` — роут покрывает E2E-проверка ниже; логика с ветками вынесена в `og.ts` и покрыта Jest.

- [ ] **Step 4: Прогон** `npx jest lib/collections/og.test.ts` → PASS. Ручная проверка на dev-сервере (Task 8): `curl -sI http://localhost:3000/api/og/collections/<slug>` → `content-type: image/png`.

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/og.ts lib/collections/og.test.ts "app/api/og/collections"
git commit -m "feat(collections): картинка превью ссылки на подборку"
```

---

### Task 8: E2E, документация, PR

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/collections.spec.ts`, `e2e/collections-layout.spec.ts`
- Modify: `docs/features/collections.md`, `docs/wiki/Book-Collections.md`, `public/openapi.json` (OG-роут)

- [ ] **Step 1: Фикстуры** — перед написанием перечитай `docs/features/testing.md` («Изоляция от прод-БД», «Смена сессии», «Локаторы кнопок каталога», «Ожидания вокруг /api/signup»).

В `interface E2EHelpers` добавить:

```ts
  /** Подборка прямо в e2e-ветке; удаляется в teardown вместе со строками аудита. */
  createTestCollection: (input: TestCollectionInput) => Promise<TestCollection>
  /** Регистрирует на удаление подборку, созданную через интерфейс. */
  trackCollection: (id: string) => void
```

Типы рядом с остальными:

```ts
interface TestCollectionInput {
  authorUserId: string
  bookIds: string[]
  status?: 'draft' | 'pending' | 'published' | 'rejected' | 'hidden'
  title?: string
  displayName?: string
  description?: string
  reason?: string | null
  /** Для published: снимок проверки со списком книг; по умолчанию = bookIds. */
  reviewedBookIds?: string[]
  /** Для published: правка автором позже последней проверки. */
  editedAfterReview?: boolean
}

interface TestCollection { id: string; slug: string | null; title: string; url: string }
```

Реализация в `base.extend` (рядом с `createTestTimeline`):

```ts
  createTestCollection: async ({ dbExec }, use, testInfo) => {
    let count = 0
    const create: E2EHelpers['createTestCollection'] = async (input) => {
      const suffix = `${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}${count++}`
      const id = `__e2e_collection_${suffix}__`
      const status = input.status ?? 'published'
      const hasSlug = status === 'published' || status === 'hidden'
      const slug = hasSlug ? `e2e-podborka-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-') : null
      const title = input.title ?? `E2E подборка ${suffix}`
      const displayName = input.displayName ?? 'E2E Автор'
      const description = input.description ?? 'Подборка, созданная E2E-фикстурой.'
      const hourAgo = new Date(Date.now() - 60 * 60_000)
      const minuteAgo = new Date(Date.now() - 60_000)
      const reviewed = hasSlug
        ? JSON.stringify({ title, descriptionMarkdown: description, displayName, bookIds: input.reviewedBookIds ?? input.bookIds })
        : null

      await dbExec(
        `insert into book_collections
           (id, slug, author_user_id, display_name, title, description_markdown, status, moderation_reason,
            submitted_at, edited_at, published_at, reviewed_at, reviewed_snapshot)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          id, slug, input.authorUserId, displayName, title, description, status, input.reason ?? null,
          status === 'draft' ? null : hourAgo,
          input.editedAfterReview ? minuteAgo : null,
          hasSlug ? hourAgo : null,
          hasSlug ? hourAgo : null,
          reviewed,
        ],
      )
      for (const [index, bookId] of input.bookIds.entries()) {
        await dbExec(
          'insert into book_collection_items (id, collection_id, book_id, position) values ($1, $2, $3, $4)',
          [`${id}_item_${index}`, id, bookId, index + 1],
        )
      }
      dbExec.registerCleanup('delete from book_collections where id = $1', [id])
      dbExec.registerCleanup(
        `delete from audit_log where entity_type in ('book_collections', 'book_collection_items')
           and (entity_id = $1 or before->>'collection_id' = $1 or after->>'collection_id' = $1)`,
        [id],
      )
      return { id, slug, title, url: `/collections/${slug ?? id}` }
    }
    await use(create)
  },

  trackCollection: async ({ dbExec }, use) => {
    await use((id) => {
      dbExec.registerCleanup('delete from book_collections where id = $1', [id])
      dbExec.registerCleanup(
        `delete from audit_log where entity_type in ('book_collections', 'book_collection_items')
           and (entity_id = $1 or before->>'collection_id' = $1 or after->>'collection_id' = $1)`,
        [id],
      )
    })
  },
```

> Порядок `registerCleanup`: сначала удаление подборки, потом аудит — как в `createTestTimeline`. Если в `e2e/fixtures.ts` уборка выполняется в обратном порядке — поменяй местами, чтобы аудит чистился после удаления.

- [ ] **Step 2: Спека флоу**

```ts
// e2e/collections.spec.ts
import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => {
  await epic('Подборки')
  await feature('Автор и читатель')
})

async function setContacts(page: import('@playwright/test').Page, name: string) {
  const res = await page.request.patch('/api/profile', { data: { name, contacts: '@e2e_collections' }, timeout: 15_000 })
  expect(res.ok()).toBeTruthy()
}

test('автор собирает черновик, он сохраняется и уходит на проверку', async ({ page, loginAsUser, createTestBook, trackCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  await loginAsUser()
  await page.goto('/collections/new')

  await page.getByLabel('Название').fill('E2E черновик подборки')
  await expect(page.getByTestId('collection-save-state')).toHaveText('Сохранено', { timeout: 15_000 })
  await expect(page).toHaveURL(/\/collections\/[^/]+\/edit$/)
  const id = page.url().match(/collections\/([^/]+)\/edit/)![1]
  trackCollection(id)

  await page.reload()
  await expect(page.getByLabel('Название')).toHaveValue('E2E черновик подборки')

  for (const book of books) {
    await page.getByPlaceholder('Найти книгу по названию или автору').fill(book.title)
    await page.getByRole('option', { name: new RegExp(book.title) }).click()
  }
  await page.getByTestId('collection-book-row').nth(1).getByRole('button', { name: 'Выше' }).click()
  await expect(page.getByTestId('collection-book-row').first()).toContainText(books[1].title)

  await page.getByLabel('Описание').fill('Зачем это читать вместе')
  await page.getByLabel('Подпись').fill('E2E Автор')
  await expect(page.getByTestId('collection-save-state')).toHaveText('Сохранено', { timeout: 15_000 })

  await page.reload()
  await expect(page.getByTestId('collection-book-row').first()).toContainText(books[1].title)

  await page.getByRole('button', { name: 'Отправить на проверку' }).click()
  await expect(page.getByTestId('collection-status-banner')).toContainText('На проверке', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByTestId('collection-status-banner')).toContainText('На проверке')
})

test('гость видит опубликованную подборку: без статусов клуба и без скрытых книг', async ({ browser, loginAsUser, createTestBook, createTestCollection, dbExec }) => {
  const [read, reading, hidden] = [await createTestBook(), await createTestBook(), await createTestBook()]
  await dbExec("update books set reading_status = 'read' where id = $1", [read.id])
  await dbExec("update books set reading_status = 'reading' where id = $1", [reading.id])
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: [read.id, reading.id, hidden.id] })
  await dbExec("update books set visibility = 'hidden' where id = $1", [hidden.id])

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await guestPage.goto(collection.url)
  const main = guestPage.locator('main.collection-page')
  await expect(main.getByRole('heading', { name: collection.title })).toBeVisible()
  await expect(main.locator('.catalog-desktop [data-testid="collection-item"]')).toHaveCount(2)
  await expect(main.getByText('Прочитано')).toHaveCount(0)
  await expect(main.getByText('Сейчас читаем')).toHaveCount(0)
  await expect(main.getByText(hidden.title)).toHaveCount(0)
  await guest.close()
})

test('запись со страницы подборки не стирает прежние книги', async ({ page, loginAsUser, createTestBook, createTestCollection, dbExec }) => {
  const [earlier, target, other] = [await createTestBook(), await createTestBook(), await createTestBook()]
  const user = await loginAsUser()
  await setContacts(page, user.name)
  expect((await page.request.post(`/api/signup-books/${earlier.id}`, { timeout: 15_000 })).ok()).toBeTruthy()
  const collection = await createTestCollection({ authorUserId: user.userId, bookIds: [target.id, other.id] })

  await page.goto(collection.url)
  const card = page.locator('.catalog-desktop article').filter({ hasText: target.title })
  await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/api/signup-books/${target.id}`) && res.request().method() === 'POST', { timeout: 15_000 }),
    card.getByRole('button', { name: /хочу читать/i }).click(),
  ])
  await page.reload()
  await expect(page.locator('.catalog-desktop article').filter({ hasText: target.title }).getByRole('button', { name: /В вашем списке/ })).toBeVisible()
  const rows = await dbExec('select book_id from signup_books where user_id = $1', [user.userId]) as Array<{ book_id: string }>
  expect(rows.map((row) => row.book_id).sort()).toEqual([earlier.id, target.id].sort())
})

test('гость нажимает «Хочу читать», входит — и книга в его списке', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const [first, second] = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: [first.id, second.id] })

  await page.context().clearCookies()
  await page.goto(collection.url)
  await page.locator('.catalog-desktop article').filter({ hasText: second.title }).getByRole('button', { name: /хочу читать/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const reader = await loginAsUser()
  await setContacts(page, reader.name)
  await page.goto(collection.url)
  const button = page.locator('.catalog-desktop article').filter({ hasText: second.title }).getByRole('button', { name: /В вашем списке/ })
  await expect(button).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await expect(button).toBeVisible()
})

test('автор не может удалить опубликованную подборку', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })
  await page.goto(`/collections/${collection.id}/edit`)
  await expect(page.getByRole('button', { name: 'Опубликовать правки' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Удалить подборку' })).toHaveCount(0)
  expect((await page.request.delete(`/api/me/collections/${collection.id}`)).status()).toBe(403)
})

test('правки опубликованной не видны читателям, пока автор их не опубликовал', async ({ browser, page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id), description: 'Старое описание' })
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()

  await page.goto(`/collections/${collection.id}/edit`)
  await page.getByLabel('Описание').fill('Новое описание')
  await guestPage.goto(collection.url)
  await expect(guestPage.locator('main.collection-page')).toContainText('Старое описание')

  await Promise.all([
    page.waitForResponse((res) => res.url().endsWith(`/api/me/collections/${collection.id}`) && res.request().method() === 'PATCH', { timeout: 15_000 }),
    page.getByRole('button', { name: 'Опубликовать правки' }).click(),
  ])
  await guestPage.reload()
  await expect(guestPage.locator('main.collection-page')).toContainText('Новое описание')
  await guest.close()
})

test('картинка превью отдаётся для опубликованной подборки', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })
  const res = await page.request.get(`/api/og/collections/${collection.slug}`)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')
})
```

> Если `dbExec` возвращает не массив строк, а объект `{ rows }` — сверь с его использованием в `e2e/fixtures.ts` и поправь чтение в третьем тесте.
> Если `/api/test/session` уже заполняет контакты — `setContacts` просто перезапишет их, это безопасно.

- [ ] **Step 3: Layout-спека**

```ts
// e2e/collections-layout.spec.ts
import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Подборки — раскладка')
})

test('на телефоне тексты подборки идут одной колонкой, номер над карточкой', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(collection.url)
  const items = page.getByTestId('collection-item-mobile')
  await expect(items).toHaveCount(2)
  const first = (await items.nth(0).boundingBox())!
  const second = (await items.nth(1).boundingBox())!
  // одна колонка: одинаковый левый край, второй целиком ниже первого
  expect(Math.abs(first.x - second.x)).toBeLessThan(1)
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1)

  const number = (await items.nth(0).getByText('№ 01').boundingBox())!
  const card = (await items.nth(0).locator('article').boundingBox())!
  expect(number.y + number.height).toBeLessThanOrEqual(card.y + 1)
})

test('на десктопе тексты идут сеткой в несколько колонок', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(collection.url)
  const items = page.getByTestId('collection-item')
  const first = (await items.nth(0).boundingBox())!
  const second = (await items.nth(1).boundingBox())!
  // колонка 760px и minmax(206px) дают три колонки: второй текст справа от первого на той же строке
  expect(Math.abs(first.y - second.y)).toBeLessThan(1)
  expect(second.x).toBeGreaterThan(first.x + first.width - 1)
})
```

- [ ] **Step 4: Прогон E2E**

```bash
npm run test:e2e:focused -- e2e/collections.spec.ts
npm run test:e2e:focused -- e2e/collections-layout.spec.ts
```

Если порт 3000 занят чужим проектом: `PLAYWRIGHT_PORT=3100 npm run test:e2e:focused -- e2e/collections.spec.ts`.

- [ ] **Step 5: Документация.** `docs/features/collections.md` — раздел «Интерфейс»: страницы и компоненты, автосохранение и «Опубликовать правки», запись одной книгой и намерения до входа, `ignoreClubStatus`, картинка превью. `docs/wiki/Book-Collections.md` — как участник собирает и публикует подборку, что видит читатель, как работает запись после входа, где в профиле. `public/openapi.json` — `GET /api/og/collections/{slug}` (`image/png`, тег `Public`).

- [ ] **Step 6: Полная проверка, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
```

В ответе:
- «E2E: нужен — новые UI-флоу с персистентностью (черновик, отправка, запись на книгу, намерение гостя) и условный рендер; `e2e/collections.spec.ts` и `e2e/collections-layout.spec.ts` прогнаны focused».
- «Wiki: нужна — новая пользовательская фича (`docs/wiki/Book-Collections.md`)».

```bash
git add e2e/fixtures.ts e2e/collections.spec.ts e2e/collections-layout.spec.ts docs public/openapi.json
git commit -m "test(collections): E2E автора и читателя, документация интерфейса"
git push -u origin feat/collections-author-reader-ui
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable
```

Дальше — правила 2, 3, 8, 9 из `CLAUDE.md`. После мержа: сообщить, что `../book-club-collections-2` можно удалить.

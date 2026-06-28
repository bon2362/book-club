# Разделение саммари по авторам — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На странице `/books/[bookSlug]/summaries` показывать саммари разных авторов по одному за раз через переключатель-пилюли, с выбором автора в `?author=` и мета-блоком автора.

**Architecture:** Страница остаётся серверным компонентом (SSR, `force-dynamic`). Чистые хелперы в `lib/summary-view.ts` строят слаги авторов, считают время чтения и выбирают активное саммари по query-параметру. Презентация разбита на изолированные компоненты: `AuthorAvatar`, `SummaryAuthorSwitcher`, `SummaryArticle`.

**Tech Stack:** Next.js 14 (App Router, RSC), TypeScript, Jest + Testing Library (unit), Playwright (e2e), inline-стили с токенами `var(--…)`.

## Global Constraints

- **PR-flow:** вся работа в отдельном `git worktree` от свежего `origin/main`; один PR на фичу; прямой push в `main` запрещён. Перед каждым коммитом — `npm run lint && npm run typecheck` зелёные (Husky прогонит lint-staged).
- **Дизайн-канон:** только токены `var(--…)`, никаких литералов цвета; острые углы (`border-radius: 0`), исключение — круг аватара; акцент линией, не заливкой; аватары **нейтральные** (без пастельной палитры псевдонимов); заголовки `var(--nd-serif)`, метки/текст `var(--nd-sans)`; микрометки UPPERCASE `0.12–0.15em`.
- **Без новых полей БД и без новых зависимостей.**
- **Время чтения:** `max(1, round(words / 150))`.
- **Дефолтный автор:** первый в списке (саммари отсортированы `publishedAt desc`).
- **`canonical`** в `generateMetadata` остаётся на `/summaries` без query.

---

## File Structure

- **Create** `lib/summary-view.ts` — чистые хелперы (slug, время чтения, выбор индекса).
- **Create** `lib/summary-view.test.ts` — юнит-тесты хелперов.
- **Create** `components/nd/AuthorAvatar.tsx` — нейтральный аватар-инициалы.
- **Create** `components/nd/AuthorAvatar.test.tsx`.
- **Create** `components/nd/SummaryAuthorSwitcher.tsx` — ряд пилюль + CTA + состояние «одно саммари».
- **Create** `components/nd/SummaryAuthorSwitcher.test.tsx`.
- **Create** `components/nd/SummaryArticle.tsx` — один блок саммари (мета + заголовок + tldr + тело).
- **Create** `components/nd/SummaryArticle.test.tsx`.
- **Modify** `app/books/[bookSlug]/summaries/page.tsx` — читать `searchParams.author`, собрать слаги/время чтения, рендерить переключатель + одно саммари.
- **Modify** `e2e/book-summaries.spec.ts` — новый тест на переключение/персистентность + проверка состояния «одно саммари».

---

## Task 1: Хелперы `lib/summary-view.ts`

**Files:**
- Create: `lib/summary-view.ts`
- Test: `lib/summary-view.test.ts`

**Interfaces:**
- Consumes: тип `BookSummary` из `@/lib/book-summaries` (поля `displayName`, `bodyMarkdown`).
- Produces:
  - `slugifyAuthor(displayName: string): string`
  - `buildAuthorSlugs(summaries: { displayName: string }[]): string[]`
  - `estimateReadingMinutes(markdown: string): number`
  - `selectSummaryIndex(slugs: string[], param: string | undefined): number`

- [ ] **Step 1: Написать падающий тест**

```ts
// lib/summary-view.test.ts
import { slugifyAuthor, buildAuthorSlugs, estimateReadingMinutes, selectSummaryIndex } from './summary-view'

describe('summary-view', () => {
  it('slugifies a display name', () => {
    expect(slugifyAuthor('alina.reads')).toBe('alina-reads')
    expect(slugifyAuthor('Дмитрий В.')).toBe('дмитрий-в')
  })

  it('falls back to "author" for empty slug', () => {
    expect(slugifyAuthor('...')).toBe('author')
  })

  it('dedupes colliding slugs by order', () => {
    expect(buildAuthorSlugs([
      { displayName: 'Сергей' },
      { displayName: 'Сергей' },
      { displayName: 'Аня' },
    ])).toEqual(['сергей', 'сергей-2', 'аня'])
  })

  it('estimates reading minutes at 150 wpm, min 1', () => {
    expect(estimateReadingMinutes('слово ещё текст')).toBe(1)
    expect(estimateReadingMinutes(Array(300).fill('слово').join(' '))).toBe(2)
  })

  it('selects index by param, defaulting to 0 on miss', () => {
    const slugs = ['аня', 'боря']
    expect(selectSummaryIndex(slugs, 'боря')).toBe(1)
    expect(selectSummaryIndex(slugs, undefined)).toBe(0)
    expect(selectSummaryIndex(slugs, 'нет-такого')).toBe(0)
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `CI=1 npx jest lib/summary-view.test.ts`
Expected: FAIL — `Cannot find module './summary-view'`.

- [ ] **Step 3: Реализовать**

```ts
// lib/summary-view.ts
const READING_WORDS_PER_MINUTE = 150

export function slugifyAuthor(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'author'
}

export function buildAuthorSlugs(summaries: { displayName: string }[]): string[] {
  const seen = new Map<string, number>()
  return summaries.map(summary => {
    const base = slugifyAuthor(summary.displayName)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

export function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE))
}

export function selectSummaryIndex(slugs: string[], param: string | undefined): number {
  if (!param) return 0
  const index = slugs.indexOf(param)
  return index === -1 ? 0 : index
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `CI=1 npx jest lib/summary-view.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: lint + commit**

```bash
npm run lint -- --file lib/summary-view.ts && npm run typecheck
git add lib/summary-view.ts lib/summary-view.test.ts
git commit -m "feat(summaries): хелперы слагов авторов и времени чтения"
```

---

## Task 2: Компонент `AuthorAvatar`

**Files:**
- Create: `components/nd/AuthorAvatar.tsx`
- Test: `components/nd/AuthorAvatar.test.tsx`

**Interfaces:**
- Produces: `default function AuthorAvatar({ name: string, size?: number }): JSX.Element` — круглый аватар с инициалами; `aria-hidden`.

- [ ] **Step 1: Написать падающий тест**

```tsx
// components/nd/AuthorAvatar.test.tsx
import { render, screen } from '@testing-library/react'
import AuthorAvatar from './AuthorAvatar'

describe('AuthorAvatar', () => {
  it('shows two-word initials uppercased', () => {
    render(<AuthorAvatar name="Дмитрий Власов" />)
    expect(screen.getByText('ДВ')).toBeInTheDocument()
  })

  it('takes first two letters for a single token', () => {
    render(<AuthorAvatar name="alina.reads" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `CI=1 npx jest components/nd/AuthorAvatar.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

```tsx
// components/nd/AuthorAvatar.tsx
interface Props {
  name: string
  size?: number
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function AuthorAvatar({ name, size = 32 }: Props) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg-tag)',
        color: 'var(--text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        flex: 'none',
      }}
    >
      {initials(name)}
    </span>
  )
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `CI=1 npx jest components/nd/AuthorAvatar.test.tsx`
Expected: PASS.

- [ ] **Step 5: lint + commit**

```bash
npm run lint -- --file components/nd/AuthorAvatar.tsx && npm run typecheck
git add components/nd/AuthorAvatar.tsx components/nd/AuthorAvatar.test.tsx
git commit -m "feat(summaries): нейтральный аватар-инициалы автора"
```

---

## Task 3: Компонент `SummaryAuthorSwitcher`

**Files:**
- Create: `components/nd/SummaryAuthorSwitcher.tsx`
- Test: `components/nd/SummaryAuthorSwitcher.test.tsx`

**Interfaces:**
- Consumes: `AuthorAvatar` (Task 2).
- Produces:
  - `export interface SwitcherAuthor { slug: string; displayName: string }`
  - `default function SummaryAuthorSwitcher({ authors: SwitcherAuthor[], activeSlug: string, basePath: string, writeHref: string }): JSX.Element`
  - При `authors.length <= 1` рендерит строку «Пока одно саммари этой книги.» + CTA; иначе `<nav aria-label="Авторы саммари">` с пилюлями-ссылками `${basePath}?author=${slug}` и CTA.

- [ ] **Step 1: Написать падающий тест**

```tsx
// components/nd/SummaryAuthorSwitcher.test.tsx
import { render, screen } from '@testing-library/react'
import SummaryAuthorSwitcher from './SummaryAuthorSwitcher'

const authors = [
  { slug: 'аня', displayName: 'Аня' },
  { slug: 'боря', displayName: 'Боря' },
]

describe('SummaryAuthorSwitcher', () => {
  it('renders a pill per author with author query links and marks the active one', () => {
    render(<SummaryAuthorSwitcher authors={authors} activeSlug="боря" basePath="/books/x/summaries" writeHref="/books/x/my-summary/edit" />)
    const active = screen.getByRole('link', { name: /Боря/ })
    expect(active).toHaveAttribute('href', '/books/x/summaries?author=%D0%B1%D0%BE%D1%80%D1%8F')
    expect(active).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Аня/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '+ Написать своё' })).toHaveAttribute('href', '/books/x/my-summary/edit')
  })

  it('shows the single-summary note instead of pills for one author', () => {
    render(<SummaryAuthorSwitcher authors={[authors[0]]} activeSlug="аня" basePath="/books/x/summaries" writeHref="/books/x/my-summary/edit" />)
    expect(screen.getByText('Пока одно саммари этой книги.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Написать своё' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `CI=1 npx jest components/nd/SummaryAuthorSwitcher.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

```tsx
// components/nd/SummaryAuthorSwitcher.tsx
import Link from 'next/link'
import AuthorAvatar from './AuthorAvatar'

export interface SwitcherAuthor {
  slug: string
  displayName: string
}

interface Props {
  authors: SwitcherAuthor[]
  activeSlug: string
  basePath: string
  writeHref: string
}

const writeCta: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--accent)',
  textDecoration: 'none',
  border: '1px solid var(--border)',
  padding: '0.45rem 0.7rem',
}

export default function SummaryAuthorSwitcher({ authors, activeSlug, basePath, writeHref }: Props) {
  if (authors.length <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Пока одно саммари этой книги.</span>
        <Link href={writeHref} style={writeCta}>+ Написать своё</Link>
      </div>
    )
  }
  return (
    <nav aria-label="Авторы саммари" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
      {authors.map(author => {
        const active = author.slug === activeSlug
        return (
          <Link
            key={author.slug}
            href={`${basePath}?author=${encodeURIComponent(author.slug)}`}
            aria-current={active ? 'true' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.7rem 0.3rem 0.3rem',
              border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
              color: active ? 'var(--text)' : 'var(--text-secondary)',
              textDecoration: 'none',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.82rem',
              background: 'var(--bg)',
            }}
          >
            <AuthorAvatar name={author.displayName} size={26} />
            {author.displayName}
          </Link>
        )
      })}
      <Link href={writeHref} style={writeCta}>+ Написать своё</Link>
    </nav>
  )
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `CI=1 npx jest components/nd/SummaryAuthorSwitcher.test.tsx`
Expected: PASS (2 теста).

- [ ] **Step 5: lint + commit**

```bash
npm run lint -- --file components/nd/SummaryAuthorSwitcher.tsx && npm run typecheck
git add components/nd/SummaryAuthorSwitcher.tsx components/nd/SummaryAuthorSwitcher.test.tsx
git commit -m "feat(summaries): переключатель авторов с состоянием одного саммари"
```

---

## Task 4: Компонент `SummaryArticle`

**Files:**
- Create: `components/nd/SummaryArticle.tsx`
- Test: `components/nd/SummaryArticle.test.tsx`

**Interfaces:**
- Consumes: `AuthorAvatar` (Task 2), `SummaryMarkdown` (существует).
- Produces: `default function SummaryArticle({ displayName: string, title: string, tldr: string, bodyMarkdown: string, publishedAt: Date | null, readingMinutes: number }): JSX.Element`.

- [ ] **Step 1: Написать падающий тест**

```tsx
// components/nd/SummaryArticle.test.tsx
import { render, screen } from '@testing-library/react'
import SummaryArticle from './SummaryArticle'

describe('SummaryArticle', () => {
  it('renders author meta, reading time, title and tldr', () => {
    render(
      <SummaryArticle
        displayName="Reader One"
        title="Почему институты важны"
        tldr="Экономика держится на правилах игры."
        bodyMarkdown="## Главная мысль\n\nТекст."
        publishedAt={new Date('2025-03-14T00:00:00Z')}
        readingMinutes={8}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Почему институты важны', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Reader One')).toBeInTheDocument()
    expect(screen.getByText('8 мин чтения')).toBeInTheDocument()
    expect(screen.getByText('Экономика держится на правилах игры.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `CI=1 npx jest components/nd/SummaryArticle.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

```tsx
// components/nd/SummaryArticle.tsx
import AuthorAvatar from './AuthorAvatar'
import SummaryMarkdown from './SummaryMarkdown'

interface Props {
  displayName: string
  title: string
  tldr: string
  bodyMarkdown: string
  publishedAt: Date | null
  readingMinutes: number
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date)
}

export default function SummaryArticle({ displayName, title, tldr, bodyMarkdown, publishedAt, readingMinutes }: Props) {
  const dateLabel = formatDate(publishedAt)
  return (
    <article>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1rem' }}>
        <AuthorAvatar name={displayName} size={40} />
        <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div><strong style={{ color: 'var(--text)' }}>{displayName}</strong> · участница клуба</div>
          <div style={{ color: 'var(--text-muted)' }}>
            {readingMinutes} мин чтения{dateLabel ? ` · опубликовано ${dateLabel}` : ''}
          </div>
        </div>
      </div>
      <h2 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.55rem', lineHeight: 1.18, margin: '0 0 1rem' }}>{title}</h2>
      <section style={{ margin: '0 0 1.4rem', padding: '1rem', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)' }}>
        <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '0.4rem' }}>В двух словах</div>
        <p style={{ margin: 0, fontFamily: 'var(--nd-serif)', lineHeight: 1.6 }}>{tldr}</p>
      </section>
      <SummaryMarkdown markdown={bodyMarkdown} />
    </article>
  )
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `CI=1 npx jest components/nd/SummaryArticle.test.tsx`
Expected: PASS.

- [ ] **Step 5: lint + commit**

```bash
npm run lint -- --file components/nd/SummaryArticle.tsx && npm run typecheck
git add components/nd/SummaryArticle.tsx components/nd/SummaryArticle.test.tsx
git commit -m "feat(summaries): блок одного саммари с мета автора"
```

---

## Task 5: Подключить в страницу `summaries/page.tsx`

**Files:**
- Modify: `app/books/[bookSlug]/summaries/page.tsx`

**Interfaces:**
- Consumes: `buildAuthorSlugs`, `estimateReadingMinutes`, `selectSummaryIndex` (Task 1); `SummaryAuthorSwitcher`, `SwitcherAuthor` (Task 3); `SummaryArticle` (Task 4).

- [ ] **Step 1: Заменить импорты и низ компонента**

Заменить строку импорта `SummaryMarkdown`:

```tsx
import SummaryAuthorSwitcher from '@/components/nd/SummaryAuthorSwitcher'
import SummaryArticle from '@/components/nd/SummaryArticle'
import { buildAuthorSlugs, estimateReadingMinutes, selectSummaryIndex } from '@/lib/summary-view'
```

(Старый импорт `SummaryMarkdown` из page удалить — он больше не используется напрямую, его рендерит `SummaryArticle`.)

- [ ] **Step 2: Принять `searchParams` и выбрать активное саммари**

Изменить сигнатуру и тело функции страницы. Заменить блок от `export default async function BookSummariesPage` до конца файла на:

```tsx
export default async function BookSummariesPage({
  params,
  searchParams,
}: {
  params: { bookSlug: string }
  searchParams: { author?: string }
}) {
  const { slugBook, book } = await resolveBookReference(params.bookSlug)
  if (!book) notFound()
  if (!slugBook && book.slug) redirect(`/books/${book.slug}/summaries`)

  const summaries = await getPublishedSummariesForBook(book.id)
  if (summaries.length === 0) notFound()

  const slugs = buildAuthorSlugs(summaries)
  const activeIndex = selectSummaryIndex(slugs, searchParams.author)
  const active = summaries[activeIndex]
  const basePath = `/books/${book.slug ?? book.id}/summaries`
  const writeHref = `/books/${book.slug ?? book.id}/my-summary/edit`
  const authors = summaries.map((summary, index) => ({ slug: slugs[index], displayName: summary.displayName }))

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <a href="/" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}>← Каталог</a>
        <header style={{ margin: '1.2rem 0 2rem', borderBottom: '2px solid var(--border-strong)', paddingBottom: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '0.5rem' }}>Саммари книги</div>
          <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '2.25rem', lineHeight: 1.12, margin: 0 }}>{book.name}</h1>
          <p style={{ fontFamily: 'var(--nd-serif)', fontStyle: 'italic', color: 'var(--text-muted)', margin: '0.6rem 0 0' }}>
            {book.author}{book.date ? ` · ${book.date}` : ''}{book.pages ? ` · ${book.pages} стр.` : ''}
          </p>
        </header>

        <SummaryAuthorSwitcher authors={authors} activeSlug={slugs[activeIndex]} basePath={basePath} writeHref={writeHref} />

        <SummaryArticle
          key={active.id}
          displayName={active.displayName}
          title={active.title}
          tldr={active.tldr}
          bodyMarkdown={active.bodyMarkdown}
          publishedAt={active.publishedAt}
          readingMinutes={estimateReadingMinutes(active.bodyMarkdown)}
        />
      </div>
    </main>
  )
}
```

(Старая функция `formatDate` в page.tsx теперь не используется — удалить её, иначе `no-unused-vars`.)

- [ ] **Step 3: Запустить полный набор unit-тестов и проверки**

Run: `CI=1 npx jest components/nd lib/summary-view.test.ts && npm run lint && npm run typecheck`
Expected: PASS; lint/typecheck без ошибок.

- [ ] **Step 4: Commit**

```bash
git add app/books/\[bookSlug\]/summaries/page.tsx
git commit -m "feat(summaries): переключатель авторов на странице книги"
```

---

## Task 6: E2E на переключение и персистентность

**Files:**
- Modify: `e2e/book-summaries.spec.ts`

**Interfaces:**
- Consumes: фикстуры `createTestBook`, `loginAsUser`, `loginAsAdmin` из `./fixtures`; готовая страница из Task 5.

- [ ] **Step 1: Добавить вспомогательную функцию и тест в конец describe-блока**

Добавить ПЕРЕД закрывающей скобкой `})` верхнего `test.describe(...)` в `e2e/book-summaries.spec.ts`:

```ts
  async function publishSummary(
    page: import('@playwright/test').Page,
    opts: { bookId: string; bookSlug: string; userName: string; displayName: string; title: string; tldr: string; body: string },
    loginAsUser: (args: { name: string }) => Promise<{ userId: string; name: string; email: string }>,
    loginAsAdmin: (args: { name: string }) => Promise<unknown>,
  ) {
    const user = await loginAsUser({ name: opts.userName })
    await page.request.post('/api/test/signup', {
      data: { userId: user.userId, name: user.name, email: user.email, contacts: '@e2e', selectedBookIds: [opts.bookId] },
    })
    await page.request.patch(`/api/signup-books/${encodeURIComponent(opts.bookId)}/status`, { data: { status: 'read' } })
    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(opts.bookId)}`)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Имя для публикации').fill(opts.displayName)
    await page.getByLabel('Заголовок саммари').fill(opts.title)
    await page.getByLabel('В двух словах').fill(opts.tldr)
    await page.getByLabel('Текст саммари').fill(opts.body)
    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await loginAsAdmin({ name: 'E2E Switcher Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText(opts.title).first().click()
    await page.getByLabel('Красивый URL книги').fill(opts.bookSlug)
    const publishResponse = page.waitForResponse(
      r => r.url().includes(`/api/admin/summaries/${draft.summary.id}/publish`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    expect((await publishResponse).ok()).toBe(true)
    return draft.summary.id
  }

  test('переключатель авторов показывает одно саммари за раз и хранит выбор в URL', async ({ page, createTestBook, loginAsUser, loginAsAdmin }) => {
    const bookSlug = `e2e-switch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const book = await createTestBook({ title: 'E2E Switcher Book', author: 'E2E Author', tags: ['институты'] })

    await publishSummary(page, {
      bookId: book.id, bookSlug, userName: 'E2E Alpha', displayName: 'Автор Альфа',
      title: 'Саммари Альфы', tldr: 'Тезис Альфы.', body: '## Раздел Альфы\n\nТекст саммари Альфы.',
    }, loginAsUser, loginAsAdmin)

    await publishSummary(page, {
      bookId: book.id, bookSlug, userName: 'E2E Beta', displayName: 'Автор Бета',
      title: 'Саммари Беты', tldr: 'Тезис Беты.', body: '## Раздел Беты\n\nТекст саммари Беты.',
    }, loginAsUser, loginAsAdmin)

    await page.goto(`/books/${bookSlug}/summaries`)
    await page.waitForLoadState('networkidle')

    // Дефолт — самое свежее саммари (Бета опубликована последней).
    await expect(page.getByRole('heading', { name: 'Саммари Беты', level: 2 })).toBeVisible()
    await expect(page.getByText('Текст саммари Альфы.')).toHaveCount(0)

    // Переключаемся на Альфу.
    await page.getByRole('link', { name: /Автор Альфа/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\?author=/)
    await expect(page.getByRole('heading', { name: 'Саммари Альфы', level: 2 })).toBeVisible()
    await expect(page.getByText('Текст саммари Беты.')).toHaveCount(0)

    // Выбор хранится в URL — после перезагрузки остаётся Альфа.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Саммари Альфы', level: 2 })).toBeVisible()
  })
```

- [ ] **Step 2: Дополнить существующий тест проверкой состояния «одно саммари»**

В существующем тесте, сразу после первой проверки публичной страницы
(`await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toBeVisible()`),
добавить строку:

```ts
    await expect(page.getByText('Пока одно саммари этой книги.')).toBeVisible()
```

- [ ] **Step 3: Прогнать e2e**

Run: `npm run test:e2e e2e/book-summaries.spec.ts`
Expected: оба теста зелёные.

- [ ] **Step 4: Commit**

```bash
git add e2e/book-summaries.spec.ts
git commit -m "test(e2e): переключение авторов саммари и персистентность ?author="
```

---

## Финал: PR

После Task 6 — `git push -u origin <branch>`, `gh pr create --fill`, `gh pr merge --auto --squash --delete-branch`, фоновый watch CI; на падение CI — фикс в ту же ветку.

**Артефакты перед коммитами (для каждого):** E2E — нужен (Task 6, новый UI-флоу + URL-состояние). Wiki — нужна: меняется пользовательский флоу страницы саммари; обновить `docs/wiki/` (раздел про саммари) после Task 5.

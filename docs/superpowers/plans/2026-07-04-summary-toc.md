# Оглавление статьи-саммари (TOC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить навигацию по разделам (заголовки H2) на страницу саммари книги: sticky-рукав слева на десктопе со scroll-spy и sticky-бар + нижний лист на мобильном.

**Architecture:** Чистая функция `extractH2Headings` строит упорядоченный список `{id,text}` из тела саммари. `SummaryMarkdown` проставляет те же `id` на `<h2>`, беря их из того же массива по счётчику в порядке документа (совпадение id гарантировано — один массив, один порядок). Клиентский `SummaryToc` рисует оба режима (рукав/мобилка), переключаемые CSS media-query, и подсвечивает активную секцию через IntersectionObserver.

**Tech Stack:** Next.js 14 (App Router, server + client components), React, react-markdown, Jest + Testing Library, Playwright. Без новых npm-зависимостей (свой `slugify`).

## Global Constraints

- **Только токены дизайн-системы**, никаких литералов цвета/скругления/теней. Цвет/шрифт — через `var(--…)`; острые углы (`--radius: 0`); активный пункт — линия `2px solid var(--accent)`, не заливка.
- **Кириллица в якорях сохраняется** (контент русский); slugify оставляет `a-z0-9а-яё`.
- **Порог показа:** оглавление рендерится только при `headings.length >= 2`.
- **В списке только H2** (`##`). H3/вложенность — вне зоны.
- Перед коммитом: `npm run lint && npm run typecheck && npm test` зелёные. UI-задача → плюс `npm run test:e2e e2e/ui-states.spec.ts`.
- Husky pre-commit обязателен, `--no-verify` запрещён. Прямых коммитов в `main` нет — работа в отдельном worktree, мерж через PR (см. `CLAUDE.md`).

---

## File Structure

- Create `lib/summary-toc.ts` — `slugify`, `extractH2Headings`, тип `TocHeading`.
- Create `lib/summary-toc.test.ts` — юнит-тесты чистой логики.
- Modify `components/nd/SummaryMarkdown.tsx` — принять `headings`, прокинуть общие `components` с счётчиком, проставить `id` + `scroll-margin-top` на `h2`.
- Modify `components/nd/SummaryMarkdown.test.tsx` — тест на инъекцию `id`.
- Create `components/nd/SummaryToc.tsx` — клиентский компонент (рукав + мобильный бар/лист + scroll-spy).
- Create `components/nd/SummaryToc.test.tsx` — RTL-тест рендера/ссылок/бара.
- Modify `components/nd/SummaryArticle.tsx` — принять `headings`, прокинуть в `SummaryMarkdown`.
- Modify `app/books/[bookSlug]/summaries/page.tsx` — grid-раскладка, вычислить `toc`, условно отрисовать `SummaryToc`.
- Modify `app/globals.css` — классы `.summary-page`, `.summary-toc*` с media-query.
- Modify `e2e/ui-states.spec.ts` — сценарии десктоп/мобилка.
- Modify `docs/features/book-summaries.md`, `docs/wiki/Book-Summaries.md` — документация.

---

## Task 1: Чистая логика оглавления (`lib/summary-toc.ts`)

**Files:**
- Create: `lib/summary-toc.ts`
- Test: `lib/summary-toc.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `interface TocHeading { id: string; text: string }`
  - `function slugify(text: string): string`
  - `function extractH2Headings(markdown: string): TocHeading[]`

- [ ] **Step 1: Написать падающий тест**

Create `lib/summary-toc.test.ts`:

```ts
import { slugify, extractH2Headings } from './summary-toc'

describe('slugify', () => {
  it('lowercases, trims, replaces non-word runs with single dash', () => {
    expect(slugify('  Ключевые Идеи!  ')).toBe('ключевые-идеи')
    expect(slugify('Chapter 1: Intro')).toBe('chapter-1-intro')
  })
  it('falls back to "section" for empty result', () => {
    expect(slugify('!!!')).toBe('section')
  })
})

describe('extractH2Headings', () => {
  it('extracts only level-2 headings in document order', () => {
    const md = '# Заголовок\n\n## Контекст\n\nтекст\n\n### Мелочь\n\n## Выводы\n'
    expect(extractH2Headings(md)).toEqual([
      { id: 'контекст', text: 'Контекст' },
      { id: 'выводы', text: 'Выводы' },
    ])
  })

  it('strips inline markdown from the visible text but keeps it readable', () => {
    const md = '## **Главная** мысль и [ссылка](https://x.io)\n'
    expect(extractH2Headings(md)).toEqual([
      { id: 'главная-мысль-и-ссылка', text: 'Главная мысль и ссылка' },
    ])
  })

  it('dedupes colliding slugs with numeric suffixes', () => {
    const md = '## Итог\n\n## Итог\n\n## Итог\n'
    expect(extractH2Headings(md).map(h => h.id)).toEqual(['итог', 'итог-2', 'итог-3'])
  })

  it('ignores "##" inside fenced code blocks', () => {
    const md = '## Реальный\n\n```\n## не заголовок\n```\n\n## Второй\n'
    expect(extractH2Headings(md).map(h => h.text)).toEqual(['Реальный', 'Второй'])
  })

  it('returns [] when there are no level-2 headings', () => {
    expect(extractH2Headings('# Только H1\n\nтекст')).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm test -- summary-toc`
Expected: FAIL — `Cannot find module './summary-toc'`.

- [ ] **Step 3: Реализация**

Create `lib/summary-toc.ts`:

```ts
export interface TocHeading {
  id: string
  text: string
}

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'section'
}

function cleanInline(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // ссылки/картинки → текст
    .replace(/[*_`~]/g, '') // маркеры эмфазы/кода
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Заголовки уровня ## в порядке документа, со стабильными slug-id (дедуп суффиксом).
 * ВАЖНО: id должны совпадать с id, которые SummaryMarkdown проставляет на <h2>.
 * Это достигается тем, что SummaryMarkdown берёт id из ЭТОГО же массива по
 * счётчику в порядке эмита (см. Task 2), а не слугифицирует независимо.
 * Fenced-code вырезаем, т.к. react-markdown не рендерит "## ..." внутри кода как h2.
 */
export function extractH2Headings(markdown: string): TocHeading[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '')
  const re = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm
  const seen = new Map<string, number>()
  const headings: TocHeading[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(withoutCode)) !== null) {
    const text = cleanInline(match[1])
    if (!text) continue
    const base = slugify(text)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    headings.push({ id: count === 1 ? base : `${base}-${count}`, text })
  }
  return headings
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npm test -- summary-toc`
Expected: PASS (5+ тестов).

- [ ] **Step 5: Коммит**

```bash
git add lib/summary-toc.ts lib/summary-toc.test.ts
git commit -m "feat: extractH2Headings — оглавление статьи-саммари (чистая логика)"
```

---

## Task 2: Инъекция id в `<h2>` (`SummaryMarkdown`)

**Files:**
- Modify: `components/nd/SummaryMarkdown.tsx`
- Test: `components/nd/SummaryMarkdown.test.tsx`

**Interfaces:**
- Consumes: `TocHeading` из `lib/summary-toc` (Task 1).
- Produces: `SummaryMarkdown` теперь принимает опциональный проп `headings?: TocHeading[]`; каждый `<h2>` получает `id = headings[i].id` (i — порядковый номер эмита h2) и `scroll-margin-top`.

- [ ] **Step 1: Написать падающий тест**

Add to `components/nd/SummaryMarkdown.test.tsx` (после существующих тестов, внутри общего describe или новым `describe`):

```ts
describe('SummaryMarkdown — id для оглавления', () => {
  it('проставляет id на h2 из пропа headings в порядке документа', () => {
    render(
      <SummaryMarkdown
        markdown={'## Первый\n\nтекст\n\n## Второй'}
        headings={[
          { id: 'первый', text: 'Первый' },
          { id: 'второй', text: 'Второй' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Первый' })).toHaveAttribute('id', 'первый')
    expect(screen.getByRole('heading', { level: 2, name: 'Второй' })).toHaveAttribute('id', 'второй')
  })

  it('не падает и не проставляет id без пропа headings', () => {
    render(<SummaryMarkdown markdown={'## Без id'} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Без id' })).not.toHaveAttribute('id')
  })
})
```

(Импорт `TocHeading` в тест не нужен — литералы структурно совпадают.)

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm test -- SummaryMarkdown`
Expected: FAIL — h2 не имеет атрибута `id` (проп `headings` пока игнорируется).

- [ ] **Step 3: Реализация**

Rewrite `components/nd/SummaryMarkdown.tsx`. Ключевые изменения: (1) `Props` получает `headings?`; (2) `components` создаётся ОДИН раз на рендер с общим счётчиком и прокидывается через `MarkdownContent`/`MarkdownBlock`; (3) `h2`-рендерер берёт id из `headings` по счётчику.

```tsx
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { remarkWikipediaEmbeds } from '@/lib/wikipedia/markdown'
import type { TocHeading } from '@/lib/summary-toc'
import WikipediaEmbed from './WikipediaEmbed'

interface Props {
  markdown: string
  headings?: TocHeading[]
}

export default function SummaryMarkdown({ markdown, headings }: Props) {
  // Счётчик эмита h2, общий на весь рендер (включая вложенные <details>-блоки).
  // id берём из headings по порядку — совпадение с extractH2Headings гарантировано.
  const h2Counter = { current: 0 }
  const components = buildComponents(headings, h2Counter)
  return (
    <div
      style={{
        fontFamily: 'var(--nd-serif), Georgia, serif',
        fontSize: '1rem',
        lineHeight: 1.75,
        color: 'var(--text-body)',
      }}
    >
      <MarkdownContent markdown={markdown} components={components} />
    </div>
  )
}

function MarkdownContent({ markdown, components }: { markdown: string; components: Components }) {
  const detailsPattern = /<details( open)?>\s*\n<summary>(.*?)<\/summary>\s*\n?([\s\S]*?)\n?<\/details>/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = detailsPattern.exec(markdown)) !== null) {
    const [source, openAttr, summary, body] = match
    const before = markdown.slice(lastIndex, match.index)
    if (before) {
      parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={before} components={components} />)
    }

    parts.push(
      <details key={`details-${match.index}`} className="nd-summary-details" open={openAttr !== undefined}>
        <summary className="nd-summary-details__summary">
          <span className="nd-summary-details__rail" aria-hidden="true" />
          <span className="nd-summary-details__title">{summary}</span>
        </summary>
        <div className="nd-summary-details__body">
          <MarkdownContent markdown={body.trim()} components={components} />
        </div>
      </details>,
    )

    lastIndex = match.index + source.length
  }

  const after = markdown.slice(lastIndex)
  if (after) {
    parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={after} components={components} />)
  }

  return <>{parts}</>
}

function MarkdownBlock({ markdown, components }: { markdown: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkWikipediaEmbeds]} components={components}>
      {markdown}
    </ReactMarkdown>
  )
}

function buildComponents(headings: TocHeading[] | undefined, h2Counter: { current: number }): Components {
  return {
    aside: props => {
      const attrs = props as Record<string, unknown>
      const source = attrs['data-wikipedia-source']
      if (attrs['data-wikipedia-embed'] === 'true' && typeof source === 'string') {
        return <WikipediaEmbed sourceUrl={source}>{props.children}</WikipediaEmbed>
      }
      return <aside>{props.children}</aside>
    },
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
        {children}
      </a>
    ),
    h1: ({ children }) => (
      <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', lineHeight: 1.15, margin: '1.5rem 0 0.75rem' }}>{children}</h1>
    ),
    h2: ({ children }) => {
      const id = headings?.[h2Counter.current]?.id
      h2Counter.current += 1
      return (
        <h2
          id={id}
          style={{
            fontFamily: 'var(--nd-serif)',
            fontSize: '1.35rem',
            lineHeight: 1.2,
            margin: '1.35rem 0 0.6rem',
            scrollMarginTop: 'calc(var(--header-height, 0px) + 1rem)',
          }}
        >
          {children}
        </h2>
      )
    },
    h3: ({ children }) => (
      <h3 style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.4, margin: '2.25rem 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--accent)' }}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', lineHeight: 1.4, margin: '1rem 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>{children}</h4>
    ),
    p: ({ children }) => <p style={{ margin: '0 0 1rem' }}>{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="nd-summary-blockquote">
        <span className="nd-summary-blockquote__mark" aria-hidden="true">“</span>
        {children}
      </blockquote>
    ),
    ul: ({ children }) => <ul style={{ listStyleType: 'disc', listStylePosition: 'outside', margin: '1rem 0', paddingLeft: '1.35rem' }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ listStyleType: 'decimal', listStylePosition: 'outside', margin: '1rem 0', paddingLeft: '1.45rem' }}>{children}</ol>,
    li: ({ children }) => <li style={{ margin: '0.2rem 0', paddingLeft: '0.15rem' }}>{children}</li>,
  }
}
```

> Примечание: если `import type { Components } from 'react-markdown'` не типизируется под установленной версией — заменить тип `Components` на `Record<string, React.ComponentType<any>>` в сигнатурах `MarkdownContent`/`MarkdownBlock`/`buildComponents`. Проверить `npm run typecheck`.

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npm test -- SummaryMarkdown`
Expected: PASS (существующие + 2 новых).

- [ ] **Step 5: Lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add components/nd/SummaryMarkdown.tsx components/nd/SummaryMarkdown.test.tsx
git commit -m "feat: SummaryMarkdown проставляет id на h2 для оглавления"
```

---

## Task 3: Клиентский компонент `SummaryToc`

**Files:**
- Create: `components/nd/SummaryToc.tsx`
- Test: `components/nd/SummaryToc.test.tsx`
- Modify: `app/globals.css` (классы `.summary-toc*`)

**Interfaces:**
- Consumes: `TocHeading` из `lib/summary-toc` (Task 1).
- Produces: `export default function SummaryToc({ headings }: { headings: TocHeading[] }): JSX.Element`. Рендерит `.summary-toc` с рукавом (`.summary-toc__rail`) и мобильным баром/листом (`.summary-toc__bar`, `.summary-toc__sheet`).

- [ ] **Step 1: Написать падающий тест**

Create `components/nd/SummaryToc.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import SummaryToc from './SummaryToc'

beforeAll(() => {
  // jsdom не реализует IntersectionObserver
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  Object.assign(global, { IntersectionObserver: IO })
})

const headings = [
  { id: 'контекст', text: 'Контекст' },
  { id: 'идеи', text: 'Ключевые идеи' },
  { id: 'выводы', text: 'Выводы' },
]

describe('SummaryToc', () => {
  it('рендерит все H2 как якорные ссылки в рукаве', () => {
    render(<SummaryToc headings={headings} />)
    const rail = screen.getByRole('navigation', { name: 'Разделы статьи' })
    expect(rail).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Контекст|Ключевые идеи|Выводы/ })).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Контекст' })).toHaveAttribute('href', '#контекст')
  })

  it('клик по пункту скроллит к нужному элементу', () => {
    const scrollIntoView = jest.fn()
    document.getElementById = jest.fn(() => ({ scrollIntoView }) as unknown as HTMLElement)
    render(<SummaryToc headings={headings} />)
    fireEvent.click(screen.getByRole('link', { name: 'Выводы' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
  })

  it('мобильный бар показывает первую секцию и открывает лист', () => {
    render(<SummaryToc headings={headings} />)
    const toggle = screen.getByRole('button', { name: /Контекст/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // в открытом листе тоже есть ссылки на секции
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm test -- SummaryToc`
Expected: FAIL — `Cannot find module './SummaryToc'`.

- [ ] **Step 3: Реализация компонента**

Create `components/nd/SummaryToc.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { TocHeading } from '@/lib/summary-toc'

export default function SummaryToc({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const visibleRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const els = headings
      .map(h => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = visibleRef.current
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const firstVisible = headings.find(h => visible.has(h.id))
        if (firstVisible) setActiveId(firstVisible.id)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  const activeText = headings.find(h => h.id === activeId)?.text ?? headings[0]?.text ?? ''

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveId(id)
    setOpen(false)
  }

  const list = (variant: 'rail' | 'sheet') => (
    <ul className={`summary-toc__list summary-toc__list--${variant}`}>
      {headings.map(h => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            onClick={go(h.id)}
            aria-current={h.id === activeId ? 'true' : undefined}
            className={`summary-toc__link${h.id === activeId ? ' is-active' : ''}`}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="summary-toc">
      {/* Десктоп: sticky-рукав */}
      <nav className="summary-toc__rail" aria-label="Разделы статьи">
        <div className="summary-toc__eyebrow t-eyebrow">Содержание</div>
        {list('rail')}
      </nav>

      {/* Мобилка: sticky-бар + нижний лист */}
      <div className="summary-toc__bar">
        <button
          type="button"
          className="summary-toc__bar-button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span className="summary-toc__bar-icon" aria-hidden="true">≡</span>
          <span className="summary-toc__bar-current">{activeText}</span>
          <span className="summary-toc__bar-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open && (
        <>
          <div className="summary-toc__overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="summary-toc__sheet" role="dialog" aria-label="Разделы статьи">
            <div className="summary-toc__eyebrow t-eyebrow">Содержание</div>
            {list('sheet')}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Стили в `app/globals.css`**

Добавить в конец `app/globals.css` (media-query переключает рукав/бар; только токены):

```css
/* ── Оглавление статьи-саммари ─────────────────────────────── */
.summary-toc__rail { display: none; }
.summary-toc__eyebrow { margin-bottom: 0.75rem; }
.summary-toc__list { list-style: none; margin: 0; padding: 0; }
.summary-toc__link {
  display: block;
  font-family: var(--nd-sans);
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 0.3rem 0 0.3rem 0.75rem;
  border-left: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.summary-toc__link:hover { color: var(--text); }
.summary-toc__link.is-active {
  color: var(--text);
  border-left-color: var(--accent);
}

/* Мобильный sticky-бар */
.summary-toc__bar {
  position: sticky;
  top: var(--header-height, 0px);
  z-index: 20;
  margin: 0 -1.5rem 1.5rem;
  background: var(--bg);
  border-bottom: 2px solid var(--border-strong);
}
.summary-toc__bar-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.7rem 1.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--nd-sans);
  font-size: 0.85rem;
  color: var(--text);
  text-align: left;
}
.summary-toc__bar-current { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-toc__bar-icon, .summary-toc__bar-caret { color: var(--text-muted); }

/* Нижний лист */
.summary-toc__overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--text) 40%, transparent);
}
.summary-toc__sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  max-height: 70vh;
  overflow-y: auto;
  padding: 1.25rem 1.5rem calc(1.25rem + env(safe-area-inset-bottom));
  background: var(--bg-input);
  border-top: 2px solid var(--border-strong);
}
.summary-toc__sheet .summary-toc__link { font-size: 0.95rem; padding: 0.55rem 0 0.55rem 0.75rem; }

/* Десктоп: показываем рукав, прячем мобильный бар */
@media (min-width: 1100px) {
  .summary-toc__rail {
    display: block;
    position: sticky;
    top: calc(var(--header-height, 0px) + 1.5rem);
  }
  .summary-toc__bar, .summary-toc__sheet, .summary-toc__overlay { display: none; }
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm test -- SummaryToc`
Expected: PASS (3 теста).

- [ ] **Step 6: Lint/typecheck**

Run: `npm run lint && npm run typecheck`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add components/nd/SummaryToc.tsx components/nd/SummaryToc.test.tsx app/globals.css
git commit -m "feat: SummaryToc — sticky-оглавление + мобильный лист со scroll-spy"
```

---

## Task 4: Встроить оглавление в страницу саммари

**Files:**
- Modify: `components/nd/SummaryArticle.tsx`
- Modify: `app/books/[bookSlug]/summaries/page.tsx`
- Modify: `app/globals.css` (класс `.summary-page`)

**Interfaces:**
- Consumes: `extractH2Headings` (Task 1), `SummaryToc` (Task 3), `SummaryMarkdown.headings` (Task 2).
- Produces: страница рендерит grid `[рукав | статья]` (≥1100px) и передаёт `headings` в `SummaryArticle` → `SummaryMarkdown`.

- [ ] **Step 1: Прокинуть `headings` через `SummaryArticle`**

В `components/nd/SummaryArticle.tsx`:

1. Импорт типа сверху:
```tsx
import type { TocHeading } from '@/lib/summary-toc'
```
2. В `interface Props` добавить поле:
```tsx
  headings?: TocHeading[]
```
3. В сигнатуре деструктуризации добавить `headings`:
```tsx
export default function SummaryArticle({
  displayName,
  title,
  tldr,
  bodyMarkdown,
  publishedAt,
  readingMinutes,
  summaryId,
  initialHelpfulCount,
  hasSession,
  headings,
}: Props) {
```
4. В JSX заменить рендер тела:
```tsx
      <div data-testid="summary-article-body">
        <SummaryMarkdown markdown={bodyMarkdown} headings={headings} />
      </div>
```

- [ ] **Step 2: Обновить страницу**

В `app/books/[bookSlug]/summaries/page.tsx`:

1. Добавить импорты:
```tsx
import SummaryToc from '@/components/nd/SummaryToc'
import { extractH2Headings } from '@/lib/summary-toc'
```
2. После `const active = summaries[activeIndex]` вычислить оглавление:
```tsx
  const toc = extractH2Headings(active.bodyMarkdown)
```
3. Заменить корневую разметку внутри `<main>`: обёртку с `maxWidth:760` заменить на grid-класс, оглавление — первым дочерним, весь прежний контент — в колонке статьи:
```tsx
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="summary-page">
        {toc.length >= 2 && <SummaryToc headings={toc} />}
        <div className="summary-page__col">
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
            summaryId={active.id}
            initialHelpfulCount={helpfulCount}
            hasSession={Boolean(session?.user?.id)}
            headings={toc}
          />
        </div>
      </div>
    </main>
  )
```

- [ ] **Step 3: Стили grid в `app/globals.css`**

Добавить (рядом с блоком `.summary-toc`):

```css
.summary-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}
.summary-page__col { min-width: 0; }
@media (min-width: 1100px) {
  .summary-page {
    max-width: 1060px;
    display: grid;
    grid-template-columns: 240px minmax(0, 760px);
    gap: 3rem;
    align-items: start;
  }
}
```

> Sticky-рукав работает благодаря тому, что grid-ячейка охватывает высоту строки (равна высоте колонки статьи), а `align-items: start` лишь выравнивает содержимое ячейки к верху — containing block для `position: sticky` остаётся полной высоты.

- [ ] **Step 4: Проверка сборки/линта/типов и существующих тестов**

Run: `npm run lint && npm run typecheck && npm test -- SummaryArticle summaries`
Expected: без ошибок; существующий `app/books/[bookSlug]/summaries/page.test.tsx` зелёный (при необходимости обновить снапшот/ожидания разметки — оставить прежние data-testid).

- [ ] **Step 5: Коммит**

```bash
git add components/nd/SummaryArticle.tsx app/books/[bookSlug]/summaries/page.tsx app/globals.css
git commit -m "feat: страница саммари — grid с оглавлением слева"
```

---

## Task 5: E2E-сценарии (`e2e/ui-states.spec.ts`)

**Files:**
- Modify: `e2e/ui-states.spec.ts`

**Interfaces:**
- Consumes: фикстура `createPublishedSummary` (`e2e/fixtures.ts`) с `overrides.bodyMarkdown`.

- [ ] **Step 1: Прочитать гочи тестов**

Прочитать `docs/features/testing.md` (обязательно перед правкой Playwright-тестов): live-locators, `.first()`, изоляция от прод-БД.

- [ ] **Step 2: Добавить сценарии**

Добавить в `e2e/ui-states.spec.ts` новый `test.describe`. Тело саммари содержит ≥3 H2, чтобы был скролл:

```ts
test.describe('Оглавление саммари (TOC)', () => {
  const body = [
    '## Контекст', ...Array(20).fill('Текст раздела контекста.'),
    '## Ключевые идеи', ...Array(20).fill('Текст раздела идей.'),
    '## Выводы', ...Array(20).fill('Текст раздела выводов.'),
  ].join('\n\n')

  test('десктоп: sticky-рукав держится во вьюпорте и подсвечивает секцию', async ({ page, createPublishedSummary }) => {
    const summary = await createPublishedSummary({ bodyMarkdown: body })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(summary.url)
    await page.waitForLoadState('networkidle')

    const rail = page.locator('.summary-toc__rail')
    await expect(rail).toBeVisible()

    // Клик по «Выводы» скроллит к секции
    await rail.getByRole('link', { name: 'Выводы' }).click()
    const heading = page.locator('h2#выводы')
    await expect.poll(async () => {
      const box = await heading.boundingBox()
      return box ? box.y : 9999
    }, { timeout: 2000 }).toBeLessThan(400)

    // Рукав остаётся во вьюпорте после скролла (sticky)
    const box = await rail.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(page.viewportSize()!.height)

    // Активная подсветка переехала на «Выводы»
    await expect.poll(
      () => rail.getByRole('link', { name: 'Выводы' }).getAttribute('aria-current'),
      { timeout: 2000 },
    ).toBe('true')
  })

  test('мобилка: sticky-бар открывает лист и скроллит', async ({ page, createPublishedSummary }) => {
    const summary = await createPublishedSummary({ bodyMarkdown: body })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(summary.url)
    await page.waitForLoadState('networkidle')

    // Рукав скрыт, бар виден
    await expect(page.locator('.summary-toc__rail')).toBeHidden()
    const bar = page.locator('.summary-toc__bar-button')
    await expect(bar).toBeVisible()

    // Тап открывает нижний лист
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Разделы статьи' })
    await expect(sheet).toBeVisible()

    // Тап по пункту скроллит и закрывает лист
    await sheet.getByRole('link', { name: 'Ключевые идеи' }).click()
    await expect(sheet).toBeHidden()
    await expect.poll(async () => {
      const box = await page.locator('h2#ключевые-идеи').boundingBox()
      return box ? box.y : 9999
    }, { timeout: 2000 }).toBeLessThan(400)
  })
})
```

- [ ] **Step 3: Прогнать e2e (изолированная ветка e2e)**

Run: `npm run test:e2e e2e/ui-states.spec.ts`
Expected: новые тесты зелёные; существующие не сломаны.

- [ ] **Step 4: Коммит**

```bash
git add e2e/ui-states.spec.ts
git commit -m "test(e2e): оглавление саммари — рукав, scroll-spy, мобильный лист"
```

---

## Task 6: Документация (features + wiki)

**Files:**
- Modify: `docs/features/book-summaries.md`
- Modify: `docs/wiki/Book-Summaries.md`

- [ ] **Step 1: Обновить `docs/features/book-summaries.md`**

Добавить раздел «Оглавление статьи (TOC)»: `lib/summary-toc.ts` (`extractH2Headings`, `slugify`), инъекция id в `SummaryMarkdown`, клиентский `SummaryToc` (scroll-spy через IntersectionObserver, рукав ≥1100px, мобильный бар+лист), порог `>= 2` заголовка, стилевые классы `.summary-toc*` / `.summary-page` в `globals.css`. Отметить, что якоря используют slug из H2 (кириллица сохраняется) и `scroll-margin-top` учитывает `--header-height`.

- [ ] **Step 2: Обновить `docs/wiki/Book-Summaries.md`**

Для владельца, без кода: на странице саммари появилось оглавление по разделам — слева на десктопе (с подсветкой текущего раздела при прокрутке), «Содержание» с нижним листом на телефоне. Строится автоматически из заголовков 2-го уровня в тексте саммари; появляется, когда таких заголовков минимум два.

- [ ] **Step 3: Коммит**

```bash
git add docs/features/book-summaries.md docs/wiki/Book-Summaries.md
git commit -m "docs: оглавление статьи-саммари (features + wiki)"
```

---

## Self-Review

**Spec coverage:**
- Десктоп левый sticky-рукав → Task 3 (`.summary-toc__rail`) + Task 4 (grid). ✓
- Мобильный sticky-бар + нижний лист → Task 3. ✓
- scroll-spy, только H2 → Task 1 (H2-only extract) + Task 3 (IntersectionObserver). ✓
- Порог `< 2` → Task 4 (`toc.length >= 2`). ✓
- id-консистентность DOM↔TOC → Task 1 + Task 2 (общий массив + счётчик). ✓
- Токены/острые углы/линия-акцент → Task 3 CSS. ✓
- `scroll-margin-top` под липкий Header → Task 2. ✓
- Unit-тест (трансформация данных) → Task 1. ✓
- E2E ui-states (CSS-поведение + UI-флоу) → Task 5. ✓
- Wiki + features → Task 6. ✓

**Placeholder scan:** плейсхолдеров нет — весь код и команды приведены целиком.

**Type consistency:** `TocHeading {id,text}` определён в Task 1, потребляется в Task 2/3/4 с теми же полями; `extractH2Headings(markdown): TocHeading[]`, `slugify(text): string`, `SummaryToc({headings})`, `SummaryMarkdown({markdown, headings?})`, `SummaryArticle` доп. проп `headings?` — согласованы.

**Открытые проверки на этапе выполнения** (из спеки):
- Подтвердить, что `--header-height` доступна глобально (ставится на элемент Header) — если скоуп-локальна, поднять на `document`/`:root`. Влияет на sticky-offset и `scroll-margin-top`.
- Тип `Components` из `react-markdown` — при проблемах типизации заменить на `Record<string, React.ComponentType<any>>` (примечание в Task 2).

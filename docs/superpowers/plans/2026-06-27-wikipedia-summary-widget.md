# Wikipedia Summary Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portable Wikipedia inserts to book summaries: authors write arbitrary teaser text, attach any language-edition article, and readers expand a safe, preloaded reading-mode version inline.

**Architecture:** A remark transform recognizes a standard Markdown blockquote whose final link has title `wikipedia`. A client component preloads a typed article document from a same-origin API; the server validates the Wikipedia URL, fetches current MediaWiki data, converts approved content to a small typed AST, enriches images with license metadata, and returns an hour-cached response. The client renders only known React nodes, never upstream HTML.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, react-markdown/remark, Cheerio, MediaWiki REST + Action APIs, Jest/Testing Library, Playwright.

---

## Scope And File Map

The feature is one cohesive flow and fits one implementation plan. No database schema changes are required.

**Create:**

- `lib/wikipedia/types.ts` — public target, article AST, attribution, and API error types.
- `lib/wikipedia/url.ts` — strict URL parsing and canonicalization.
- `lib/wikipedia/url.test.ts` — URL matrix and deceptive-host coverage.
- `lib/wikipedia/markdown.ts` — remark transform for portable Wikipedia blockquotes.
- `lib/wikipedia/markdown.test.ts` — AST recognition and fallback behavior.
- `lib/wikipedia/transform.ts` — MediaWiki HTML to typed article nodes.
- `lib/wikipedia/transform.test.ts` — external-data transformation and hostile-markup tests.
- `lib/wikipedia/fetch.ts` — MediaWiki metadata, article, image metadata, timeout, and retry orchestration.
- `lib/wikipedia/fetch.test.ts` — mocked upstream responses and failure mapping.
- `app/api/wikipedia/article/route.ts` — public same-origin cached API.
- `app/api/wikipedia/article/route.test.ts` — request validation, status mapping, and cache headers.
- `components/nd/WikipediaArticle.tsx` — exhaustive typed-node renderer.
- `components/nd/WikipediaEmbed.tsx` — preload and disclosure state machine.
- `components/nd/WikipediaEmbed.test.tsx` — preload, keyboard, ready, loading, and error states.
- `components/nd/WikipediaInsertDialog.tsx` — URL dialog used by the Markdown toolbar.

**Modify:**

- `package.json`, `package-lock.json` — direct dependencies for parsing.
- `components/nd/SummaryMarkdown.tsx` — register the remark transform and embed component.
- `components/nd/SummaryMarkdown.test.tsx` — valid widget and ordinary-blockquote regression tests.
- `components/nd/MarkdownToolbar.tsx` — add the `W` command and selection wrapping.
- `components/nd/MarkdownToolbar.test.tsx` — dialog, selection, empty selection, and validation tests.
- `app/globals.css` — token-only widget, reader, hover, mobile, focus, and reduced-motion styles.
- `e2e/book-summaries.spec.ts` — toolbar, persistence reload, preload, public rendering, and API fallback flow.
- `e2e/ui-states.spec.ts` — `boundingBox()` and internal-scroll proof.
- `docs/features/book-summaries.md` — code-level contract and API behavior.
- `docs/wiki/Book-Summaries.md` — owner-facing author and reader workflow.

## Required Commit Discipline

Before every commit:

1. State `E2E: нужен / не нужен — причина` in the visible progress update.
2. State `Wiki: нужна / не нужна — причина` in the visible progress update.
3. Run at least `npm run lint && npm run typecheck`.
4. Never use `--no-verify`.

For commits that change the widget UI or CSS, also run:

```bash
npm test -- --runInBand
npm run test:e2e -- e2e/ui-states.spec.ts
```

---

### Task 1: Shared Types And Strict Wikipedia URL Parsing

**Files:**
- Create: `lib/wikipedia/types.ts`
- Create: `lib/wikipedia/url.ts`
- Test: `lib/wikipedia/url.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install direct parsing dependencies**

Run:

```bash
npm install cheerio unist-util-visit
npm install --save-dev @types/mdast
```

Expected: `package.json` lists `cheerio` and `unist-util-visit` under dependencies and `@types/mdast` under devDependencies; lockfile updates without unrelated package edits.

- [ ] **Step 2: Write the failing URL tests**

Create `lib/wikipedia/url.test.ts` with this behavior matrix:

```ts
import { WikipediaUrlError, parseWikipediaUrl } from './url'

describe('parseWikipediaUrl', () => {
  it.each([
    ['https://ru.wikipedia.org/wiki/Социализм', 'ru', 'Социализм'],
    ['https://en.wikipedia.org/wiki/Socialism', 'en', 'Socialism'],
    ['https://zh-min-nan.wikipedia.org/wiki/Siā-hōe-chú-gī', 'zh-min-nan', 'Siā-hōe-chú-gī'],
    ['https://ru.m.wikipedia.org/wiki/Социализм#История', 'ru', 'Социализм'],
    ['https://de.wikipedia.org/w/index.php?title=Sozialismus', 'de', 'Sozialismus'],
  ])('normalizes %s', (input, language, title) => {
    expect(parseWikipediaUrl(input)).toMatchObject({ language, title })
  })

  it.each([
    'http://ru.wikipedia.org/wiki/Социализм',
    'https://www.wikipedia.org/',
    'https://wikipedia.org.example.com/wiki/Социализм',
    'https://commons.wikimedia.org/wiki/File:Example.jpg',
    'https://ru.wikipedia.org/',
  ])('rejects unsupported source %s', input => {
    expect(() => parseWikipediaUrl(input)).toThrow(WikipediaUrlError)
  })
})
```

- [ ] **Step 3: Run the URL tests to verify RED**

Run:

```bash
npm test -- --runInBand lib/wikipedia/url.test.ts
```

Expected: FAIL because `lib/wikipedia/url.ts` does not exist.

- [ ] **Step 4: Define the shared article contract**

Create `lib/wikipedia/types.ts` with these exact exported shapes:

```ts
export interface WikipediaTarget {
  language: string
  title: string
  articleUrl: string
}

export type WikipediaInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: WikipediaInlineNode[] }
  | { type: 'emphasis'; children: WikipediaInlineNode[] }
  | { type: 'link'; href: string; children: WikipediaInlineNode[] }

export interface WikipediaImageAttribution {
  artist: string
  licenseName: string
  licenseUrl: string
  descriptionUrl: string
}

export type WikipediaArticleNode =
  | { type: 'heading'; level: 2 | 3 | 4; children: WikipediaInlineNode[] }
  | { type: 'paragraph'; children: WikipediaInlineNode[] }
  | { type: 'list'; ordered: boolean; items: WikipediaInlineNode[][] }
  | { type: 'quote'; children: WikipediaInlineNode[] }
  | {
      type: 'image'
      src: string
      alt: string
      caption: WikipediaInlineNode[]
      attribution: WikipediaImageAttribution
    }

export interface WikipediaArticleDocument {
  language: string
  title: string
  articleUrl: string
  historyUrl: string
  revisionId: number
  revisionTimestamp: string
  nodes: WikipediaArticleNode[]
}

export type WikipediaArticleErrorCode =
  | 'invalid_url'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'article_too_large'
  | 'upstream_error'

export class WikipediaArticleError extends Error {
  constructor(
    public readonly code: WikipediaArticleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WikipediaArticleError'
  }
}
```

- [ ] **Step 5: Implement strict URL parsing**

Create `lib/wikipedia/url.ts`. Use `new URL()`, require HTTPS, match the hostname with `^([a-z0-9-]+)(?:\.m)?\.wikipedia\.org$`, reject `www`, and accept only `/wiki/<title>` or `/w/index.php?title=<title>`. Decode the title once, replace underscores with spaces for the API title, and build `articleUrl` from the validated language and encoded title:

```ts
import type { WikipediaTarget } from './types'

const WIKIPEDIA_HOST = /^([a-z0-9-]+)(?:\.m)?\.wikipedia\.org$/i

export class WikipediaUrlError extends Error {
  constructor(message = 'Некорректная ссылка на статью Wikipedia') {
    super(message)
    this.name = 'WikipediaUrlError'
  }
}

export function parseWikipediaUrl(input: string): WikipediaTarget {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new WikipediaUrlError()
  }

  if (url.protocol !== 'https:') throw new WikipediaUrlError()
  const hostMatch = url.hostname.toLowerCase().match(WIKIPEDIA_HOST)
  const language = hostMatch?.[1]
  if (!language || language === 'www') throw new WikipediaUrlError()

  const pathTitle = url.pathname.startsWith('/wiki/') ? url.pathname.slice('/wiki/'.length) : null
  const queryTitle = url.pathname === '/w/index.php' ? url.searchParams.get('title') : null
  if (!pathTitle && !queryTitle) throw new WikipediaUrlError()

  let title: string
  try {
    // URLSearchParams already decodes query values; pathname segments still need decoding.
    title = (pathTitle ? decodeURIComponent(pathTitle) : queryTitle!)
      .replaceAll('_', ' ')
      .trim()
  } catch {
    throw new WikipediaUrlError()
  }
  if (!title || title.includes('\0')) throw new WikipediaUrlError()

  const articleSlug = encodeURIComponent(title.replaceAll(' ', '_'))
  return {
    language,
    title,
    articleUrl: `https://${language}.wikipedia.org/wiki/${articleSlug}`,
  }
}
```

- [ ] **Step 6: Run URL tests and static checks**

Run:

```bash
npm test -- --runInBand lib/wikipedia/url.test.ts
npm run lint
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 1**

State: `E2E: не нужен — добавлены pure URL/type helpers без UI.`
State: `Wiki: не нужна — пользовательское поведение еще не подключено.`

```bash
git add package.json package-lock.json lib/wikipedia/types.ts lib/wikipedia/url.ts lib/wikipedia/url.test.ts
git commit -m "feat: validate Wikipedia article URLs"
```

---

### Task 2: Portable Markdown Recognition

**Files:**
- Create: `lib/wikipedia/markdown.ts`
- Test: `lib/wikipedia/markdown.test.ts`

- [ ] **Step 1: Write failing AST transformation tests**

Create blockquote fixtures as mdast objects. Assert that a valid final link is removed from author children and the blockquote gains semantic hast data, while invalid forms remain untouched:

```ts
import type { Blockquote, Root } from 'mdast'
import { remarkWikipediaEmbeds } from './markdown'

function transform(blockquote: Blockquote): Blockquote {
  const root: Root = { type: 'root', children: [blockquote] }
  const plugin = remarkWikipediaEmbeds()
  plugin(root)
  return root.children[0] as Blockquote
}

describe('remarkWikipediaEmbeds', () => {
  it('marks a portable Wikipedia blockquote and keeps author Markdown', () => {
    const result = transform({
      type: 'blockquote',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'Авторский текст' }] },
        {
          type: 'paragraph',
          children: [{
            type: 'link',
            url: 'https://en.wikipedia.org/wiki/Socialism',
            title: 'wikipedia',
            children: [{ type: 'text', value: 'Wikipedia: Socialism' }],
          }],
        },
      ],
    })

    expect(result.children).toHaveLength(1)
    expect(result.data).toMatchObject({
      hName: 'aside',
      hProperties: {
        'data-wikipedia-embed': 'true',
        'data-wikipedia-source': 'https://en.wikipedia.org/wiki/Socialism',
      },
    })
  })

  it.each(['Wikipedia', null])('keeps ordinary blockquotes for title %s', title => {
    const input: Blockquote = {
      type: 'blockquote',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'link',
          url: 'https://en.wikipedia.org/wiki/Socialism',
          title,
          children: [{ type: 'text', value: 'source' }],
        }],
      }],
    }
    expect(transform(input).data).toBeUndefined()
  })

  it('does not create an empty widget from a source-only quote', () => {
    const input: Blockquote = {
      type: 'blockquote',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'link',
          url: 'https://en.wikipedia.org/wiki/Socialism',
          title: 'wikipedia',
          children: [{ type: 'text', value: 'source' }],
        }],
      }],
    }
    expect(transform(input).data).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the Markdown test to verify RED**

Run `npm test -- --runInBand lib/wikipedia/markdown.test.ts`.

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the remark transform**

Create `lib/wikipedia/markdown.ts` using `unist-util-visit`. Only transform a `blockquote` when its final child is a paragraph containing exactly one valid Wikipedia link with title `wikipedia` case-insensitively. Store only the canonical validated URL in `hProperties`:

```ts
import type { Blockquote, Link, Paragraph, Root } from 'mdast'
import { visit } from 'unist-util-visit'
import { parseWikipediaUrl } from './url'

export function remarkWikipediaEmbeds() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      if (node.children.length < 2) return
      const sourceParagraph = node.children.at(-1)
      if (sourceParagraph?.type !== 'paragraph') return
      const link = getSourceLink(sourceParagraph)
      if (!link || link.title?.toLowerCase() !== 'wikipedia') return

      try {
        const target = parseWikipediaUrl(link.url)
        node.children = node.children.slice(0, -1)
        node.data = {
          ...node.data,
          hName: 'aside',
          hProperties: {
            'data-wikipedia-embed': 'true',
            'data-wikipedia-source': target.articleUrl,
          },
        }
      } catch {
        return
      }
    })
  }
}

function getSourceLink(paragraph: Paragraph): Link | null {
  if (paragraph.children.length !== 1) return null
  const child = paragraph.children[0]
  return child.type === 'link' ? child : null
}
```

- [ ] **Step 4: Run focused and full unit tests**

Run:

```bash
npm test -- --runInBand lib/wikipedia/markdown.test.ts lib/wikipedia/url.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

State: `E2E: не нужен — renderer еще не подключен; AST-контракт покрыт unit-тестами.`
State: `Wiki: не нужна — пользовательское поведение еще не подключено.`

```bash
git add lib/wikipedia/markdown.ts lib/wikipedia/markdown.test.ts
git commit -m "feat: recognize portable Wikipedia embeds"
```

---

### Task 3: Convert MediaWiki HTML Into A Typed Reading Document

**Files:**
- Create: `lib/wikipedia/transform.ts`
- Test: `lib/wikipedia/transform.test.ts`

- [ ] **Step 1: Write failing hostile-HTML and reading-mode tests**

Use one compact fixture containing allowed prose plus every disallowed family. The expected document must retain headings, emphasis, links, lists, quote, and one attributed image while omitting scripts, tables, infoboxes, navboxes, references, and an unattributed image:

```ts
import { transformWikipediaHtml } from './transform'

const html = `
  <html><body>
    <script>alert(1)</script>
    <div class="hatnote">service note</div>
    <table class="infobox"><tr><td>infobox</td></tr></table>
    <section>
      <h2>History <span class="mw-editsection">edit</span></h2>
      <p>First <b>strong</b> paragraph with <a href="./Democracy">democracy</a>.</p>
      <ul><li>One</li><li>Two</li></ul>
      <blockquote>Quoted idea</blockquote>
      <figure typeof="mw:File/Thumb">
        <a href="./File:Attributed.jpg"><img resource="./File:Attributed.jpg" src="//upload.wikimedia.org/attributed.jpg" alt="Attributed"></a>
        <figcaption>Caption</figcaption>
      </figure>
      <figure><img resource="./File:Missing.jpg" src="//upload.wikimedia.org/missing.jpg"></figure>
      <ol class="references"><li>Reference</li></ol>
      <div class="navbox">Navigation</div>
    </section>
  </body></html>`

describe('transformWikipediaHtml', () => {
  it('returns only supported reading-mode nodes', () => {
    const nodes = transformWikipediaHtml({
      html,
      articleUrl: 'https://en.wikipedia.org/wiki/Socialism',
      imageAttributions: new Map([['File:Attributed.jpg', {
        artist: 'Example Author',
        licenseName: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        descriptionUrl: 'https://commons.wikimedia.org/wiki/File:Attributed.jpg',
      }]]),
    })

    expect(nodes.map(node => node.type)).toEqual(['heading', 'paragraph', 'list', 'quote', 'image'])
    expect(JSON.stringify(nodes)).not.toMatch(/alert|infobox|Reference|Navigation|Missing/)
    expect(JSON.stringify(nodes)).toContain('https://en.wikipedia.org/wiki/Democracy')
  })
})
```

- [ ] **Step 2: Run the transform test to verify RED**

Run `npm test -- --runInBand lib/wikipedia/transform.test.ts`.

Expected: FAIL because `transformWikipediaHtml` is missing.

- [ ] **Step 3: Implement block and inline conversion**

Create `lib/wikipedia/transform.ts` with:

```ts
export interface TransformWikipediaHtmlInput {
  html: string
  articleUrl: string
  imageAttributions: Map<string, WikipediaImageAttribution>
}

export function collectWikipediaImageTitles(html: string, limit = 8): string[]

export function transformWikipediaHtml(
  input: TransformWikipediaHtmlInput,
): WikipediaArticleNode[]
```

Implementation requirements:

1. Parse with `load(html)` from Cheerio.
2. Remove `script, style, iframe, form, table, .infobox, .navbox, .vertical-navbox, .hatnote, .ambox, .mw-editsection, .toc, .references, .reflist, sup.reference, [hidden]` before traversal.
3. Recursively walk `body` and `section` containers in source order.
4. Map only `h2`–`h4`, `p`, `ul`, `ol`, `blockquote`, and `figure` to exported node types.
5. Inline traversal maps text, `strong/b`, `em/i`, and `a`; unknown inline wrappers flatten to safe children.
6. Resolve `./Title`, `/wiki/Title`, and `#fragment` against `articleUrl`; accept only `https:` links after resolution.
7. Get a figure file title from `resource` or its link path. Emit the figure only when `imageAttributions` contains the title and the normalized image host is exactly `upload.wikimedia.org` or ends with `.wikimedia.org`.
8. `collectWikipediaImageTitles` returns the first eight unique `File:` resource titles in document order.
9. Drop empty nodes after whitespace normalization.

- [ ] **Step 4: Add focused edge-case assertions**

Extend the test with:

```ts
expect(collectWikipediaImageTitles(html)).toEqual([
  'File:Attributed.jpg',
  'File:Missing.jpg',
])
```

Add one test proving `javascript:`, `data:`, and protocol-relative non-Wikimedia image URLs are omitted.

- [ ] **Step 5: Run transformation tests and static checks**

Run:

```bash
npm test -- --runInBand lib/wikipedia/transform.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

State: `E2E: не нужен — pure external-data transform покрыт обязательными unit-тестами.`
State: `Wiki: не нужна — пользовательский поток еще не подключен.`

```bash
git add lib/wikipedia/transform.ts lib/wikipedia/transform.test.ts
git commit -m "feat: normalize Wikipedia article content"
```

---

### Task 4: MediaWiki Fetching, Attribution, Limits, And Retry

**Files:**
- Create: `lib/wikipedia/fetch.ts`
- Test: `lib/wikipedia/fetch.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Mock `global.fetch` with ordered responses and assert:

1. Metadata request resolves a redirect to canonical title, namespace `0`, revision id/timestamp, full URL.
2. REST request uses the canonical title and project User-Agent.
3. Image metadata request batches collected `File:` titles and maps `Artist`, `LicenseShortName`, `LicenseUrl`, and `descriptionurl`.
4. Returned `WikipediaArticleDocument` contains normalized nodes, canonical URL, history URL, and revision metadata.
5. Missing page maps to `not_found`; `429` maps to `rate_limited`; abort maps to `timeout`; oversized `content-length` and oversized body map to `article_too_large`.
6. `429` and `503` perform at most one retry; all other failures perform none.

Use this public signature:

```ts
await fetchWikipediaArticle(parseWikipediaUrl('https://en.wikipedia.org/wiki/Socialism'), {
  fetchImpl: jest.fn(),
  timeoutMs: 100,
})
```

- [ ] **Step 2: Run fetch tests to verify RED**

Run `npm test -- --runInBand lib/wikipedia/fetch.test.ts`.

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the fetch pipeline**

Create `lib/wikipedia/fetch.ts` with constants and injectable options:

```ts
const USER_AGENT = 'SlowReadingClub/1.0 (https://www.slowreading.club)'
const MAX_UPSTREAM_BYTES = 1_500_000
const DEFAULT_TIMEOUT_MS = 8_000

interface FetchWikipediaOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function fetchWikipediaArticle(
  target: WikipediaTarget,
  options: FetchWikipediaOptions = {},
): Promise<WikipediaArticleDocument>
```

Pipeline:

1. Query `https://{language}.wikipedia.org/w/api.php` with `action=query`, `format=json`, `formatversion=2`, `prop=info|revisions`, `inprop=url`, `rvprop=ids|timestamp`, `redirects=1`, and `titles`.
2. Require a page with `ns === 0`, non-missing `pageid`, canonical title, `fullurl`, and one revision.
3. Fetch `https://{language}.wikipedia.org/w/rest.php/v1/page/{encoded canonical title}/html`.
4. Reject from `content-length` before reading when it exceeds `MAX_UPSTREAM_BYTES`; reject again after reading by UTF-8 byte length.
5. Collect at most eight image titles and query the Action API with `prop=imageinfo`, `iiprop=url|extmetadata`, and batched `titles`.
6. Strip HTML from `Artist` and other extmetadata values with Cheerio text extraction. Require artist, license short name, license URL, and description URL; otherwise omit attribution.
7. Call `transformWikipediaHtml` and return the complete document. Build history URL as `${articleUrl}?action=history`.
8. Send `User-Agent` and `Accept` on every request. Never forward request cookies or headers.
9. Use one `AbortController` per upstream request. Retry once after 250 ms only for `429` or `503`; honor a numeric `Retry-After` up to one second.
10. Convert errors to `WikipediaArticleError` codes from `types.ts`.

- [ ] **Step 4: Run fetch and transform suites**

Run:

```bash
npm test -- --runInBand lib/wikipedia/fetch.test.ts lib/wikipedia/transform.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

State: `E2E: не нужен — upstream orchestration покрыт детерминированными unit-тестами.`
State: `Wiki: не нужна — API еще не доступен пользователю.`

```bash
git add lib/wikipedia/fetch.ts lib/wikipedia/fetch.test.ts
git commit -m "feat: fetch current Wikipedia articles"
```

---

### Task 5: Public Cached Wikipedia API Route

**Files:**
- Create: `app/api/wikipedia/article/route.ts`
- Test: `app/api/wikipedia/article/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock `parseWikipediaUrl` and `fetchWikipediaArticle`. Cover missing `url`, invalid URL, success, each typed upstream error, and unexpected error. Assert the successful cache header exactly:

```ts
expect(response.headers.get('Cache-Control')).toBe(
  'public, s-maxage=3600, stale-while-revalidate=86400',
)
```

Expected status mapping:

```ts
const statusByCode = {
  invalid_url: 400,
  not_found: 404,
  rate_limited: 503,
  timeout: 504,
  article_too_large: 413,
  upstream_error: 502,
} as const
```

- [ ] **Step 2: Run route tests to verify RED**

Run `npm test -- --runInBand app/api/wikipedia/article/route.test.ts`.

Expected: FAIL because the route is missing.

- [ ] **Step 3: Implement GET**

Create a parameterized `GET(request: NextRequest)` that:

1. Reads one `url` search parameter.
2. Returns `{ error: 'invalid_url' }` with `400` when absent or rejected.
3. Calls `fetchWikipediaArticle(parseWikipediaUrl(url))`.
4. Returns the article as JSON with the exact public cache header above.
5. Returns `{ error: code }` with the mapped status for `WikipediaArticleError`.
6. Logs only the error code and safe language/title context; never logs the full user URL or article body.
7. Returns `{ error: 'upstream_error' }` and `502` for unknown errors.

- [ ] **Step 4: Run route and library tests**

Run:

```bash
npm test -- --runInBand app/api/wikipedia/article/route.test.ts lib/wikipedia
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

State: `E2E: не нужен — API route покрыт unit-тестами, UI еще не подключен.`
State: `Wiki: нужна позже — новый endpoint документируем в финальном docs-коммите вместе с пользовательским flow.`

```bash
git add app/api/wikipedia/article/route.ts app/api/wikipedia/article/route.test.ts
git commit -m "feat: expose cached Wikipedia reading API"
```

---

### Task 6: Interactive Embed, Typed Renderer, And Markdown Integration

**Files:**
- Create: `components/nd/WikipediaArticle.tsx`
- Create: `components/nd/WikipediaEmbed.tsx`
- Test: `components/nd/WikipediaEmbed.test.tsx`
- Modify: `components/nd/SummaryMarkdown.tsx`
- Modify: `components/nd/SummaryMarkdown.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing component tests**

Mock `global.fetch` and use a small `WikipediaArticleDocument`. Tests must prove:

```ts
it('preloads on mount before disclosure is opened', async () => {
  render(<WikipediaEmbed sourceUrl={sourceUrl}><p>Авторский текст</p></WikipediaEmbed>)
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    `/api/wikipedia/article?url=${encodeURIComponent(sourceUrl)}`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  ))
  expect(screen.queryByRole('region', { name: /статья wikipedia/i })).not.toBeInTheDocument()
})

it('opens ready content without a second request', async () => {
  render(<WikipediaEmbed sourceUrl={sourceUrl}><p>Авторский текст</p></WikipediaEmbed>)
  await waitFor(() => expect(screen.getByText('Авторский текст')).toBeVisible())
  fireEvent.click(screen.getByRole('button', { name: /wikipedia/i }))
  expect(await screen.findByRole('heading', { name: 'Socialism' })).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
})
```

Also cover loading after immediate click, `Enter`, `Space`, error fallback link, retry after error, external link attributes, and no toggle when `window.getSelection()` returns selected text.

- [ ] **Step 2: Write failing SummaryMarkdown integration tests**

Replace the simplistic `react-markdown` mock only where necessary so a real remark transform can run, or test the renderer with the mock disabled for this suite. Assert:

1. The exact portable Markdown produces one `.nd-wikipedia-embed` and author text.
2. A normal blockquote keeps `.nd-summary-blockquote`.
3. A deceptive or invalid Wikipedia link stays an ordinary blockquote.
4. Raw HTML still does not execute.

- [ ] **Step 3: Run component tests to verify RED**

Run:

```bash
npm test -- --runInBand components/nd/WikipediaEmbed.test.tsx components/nd/SummaryMarkdown.test.tsx
```

Expected: FAIL because the components and integration are absent.

- [ ] **Step 4: Implement the exhaustive typed article renderer**

Create `WikipediaArticle.tsx`. Use an exhaustive `switch` over `WikipediaArticleNode.type`; recursively render inline nodes. Requirements:

- headings remain `h2`–`h4`;
- lists preserve ordered/unordered semantics;
- all links use `target="_blank" rel="noopener noreferrer"`;
- images use `loading="lazy"`, alt text, a caption, artist, license link, and file-description link;
- the footer links to `articleUrl`, `historyUrl`, and `https://creativecommons.org/licenses/by-sa/4.0/`;
- no `dangerouslySetInnerHTML`.

- [ ] **Step 5: Implement the preload and disclosure state machine**

Create `WikipediaEmbed.tsx` as a client component with:

```ts
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; article: WikipediaArticleDocument }
  | { status: 'error' }
```

Behavior:

1. Start one abortable fetch in `useEffect` immediately on mount.
2. Keep the same promise/result when opening; do not refetch ready data.
3. Render author children in the summary surface.
4. Use a keyboard-operable toggle with `aria-expanded`, `aria-controls`, and visible focus.
5. Ignore a pointer toggle when `window.getSelection()?.toString()` is non-empty.
6. Mount `WikipediaArticle` only while open, ensuring image URLs are not requested while collapsed.
7. Show `role="status"` only when the user opened during loading.
8. On error, keep the author text and show the safe source link plus a retry button.
9. Keep focus on the toggle; do not auto-focus the scroll region.

- [ ] **Step 6: Register the remark transform in SummaryMarkdown**

In `SummaryMarkdown.tsx`:

1. Add `remarkPlugins={[remarkWikipediaEmbeds]}` to every `ReactMarkdown` block.
2. Add an `aside` component mapping. If `data-wikipedia-embed === 'true'` and `data-wikipedia-source` is a string, return `<WikipediaEmbed sourceUrl={...}>{children}</WikipediaEmbed>`.
3. Preserve the existing details recursion, quote styling, heading hierarchy, paragraph spacing, lists, and safe links.

- [ ] **Step 7: Add token-only widget CSS**

Append a dedicated `Book summary Wikipedia embed` section to `app/globals.css`. Implement these stable classes:

```css
.nd-wikipedia-embed {
  margin: 2rem 0;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border-strong);
}

.nd-wikipedia-embed__summary {
  padding: 1.1rem 1.25rem;
  transition: background 140ms ease;
}

.nd-wikipedia-embed:not([data-open='true']) .nd-wikipedia-embed__summary:hover {
  background: var(--bg-elevated);
}

.nd-wikipedia-embed__reader {
  max-height: 64vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid var(--border);
  background: var(--bg-input);
}
```

Complete the source row, `W` mark, micro-label, author text, action row, sticky reader toolbar, article typography, figures, attribution, focus-visible, mobile `68svh`, and reduced-motion rules using only existing CSS variables. Do not add radius, shadow, raw color literals, or a nested card.

- [ ] **Step 8: Run unit, static, and required layout tests**

At this point the old UI-state suite must remain green before adding new assertions:

```bash
npm test -- --runInBand components/nd/WikipediaEmbed.test.tsx components/nd/SummaryMarkdown.test.tsx lib/wikipedia
npm run lint
npm run typecheck
npm run test:e2e -- e2e/ui-states.spec.ts
```

Expected: existing 23 UI-state tests PASS.

- [ ] **Step 9: Commit Task 6**

State: `E2E: нужен — добавлены disclosure, preload и CSS; существующий ui-states прогнан, новые layout assertions появятся в Task 8.`
State: `Wiki: нужна — пользовательская фича подключена; документация обновляется в Task 9.`

```bash
git add components/nd/WikipediaArticle.tsx components/nd/WikipediaEmbed.tsx components/nd/WikipediaEmbed.test.tsx components/nd/SummaryMarkdown.tsx components/nd/SummaryMarkdown.test.tsx app/globals.css
git commit -m "feat: render inline Wikipedia reading widgets"
```

---

### Task 7: Toolbar Dialog And Portable Markdown Insertion

**Files:**
- Create: `components/nd/WikipediaInsertDialog.tsx`
- Modify: `components/nd/MarkdownToolbar.tsx`
- Modify: `components/nd/MarkdownToolbar.test.tsx`

- [ ] **Step 1: Write failing toolbar tests**

Extend the harness tests to cover:

```ts
it('wraps selected text in a portable Wikipedia block', () => {
  render(<Harness />)
  const textarea = screen.getByLabelText('markdown') as HTMLTextAreaElement
  textarea.setSelectionRange(0, 6)
  fireEvent.click(screen.getByRole('button', { name: 'Вставка из Wikipedia' }))
  fireEvent.change(screen.getByLabelText('Ссылка на статью Wikipedia'), {
    target: { value: 'https://ru.wikipedia.org/wiki/Социализм' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Вставить' }))

  expect(textarea.value).toContain('> важный')
  expect(textarea.value).toContain(
    '> [Wikipedia: Социализм](https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC "wikipedia")',
  )
})
```

Also assert:

- multiline selection prefixes non-empty lines with `> ` and empty lines with `>`;
- empty selection inserts `> Текст вставки`;
- invalid/deceptive URL keeps `role="dialog"` open and displays an inline error;
- Escape closes without changing the textarea;
- successful insertion restores textarea focus and selects the author text, not the source line.

- [ ] **Step 2: Run toolbar tests to verify RED**

Run `npm test -- --runInBand components/nd/MarkdownToolbar.test.tsx`.

Expected: FAIL because the button and dialog do not exist.

- [ ] **Step 3: Implement a focused dialog**

Create `WikipediaInsertDialog.tsx` with props:

```ts
interface WikipediaInsertDialogProps {
  initialUrl?: string
  onCancel: () => void
  onInsert: (target: WikipediaTarget) => void
}
```

Requirements:

- `role="dialog"`, `aria-modal="true"`, and title «Вставка из Wikipedia»;
- one URL input with visible label;
- Cancel and Insert commands using existing token-only button patterns;
- validation through shared `parseWikipediaUrl`;
- inline error «Вставьте ссылку на статью вида https://ru.wikipedia.org/wiki/…»;
- Escape calls `onCancel`;
- initial focus on the URL input;
- no click-outside close, so an accidental click cannot discard the URL.

- [ ] **Step 4: Add the toolbar command and formatter**

In `MarkdownToolbar.tsx`:

1. Add a `W` button with `aria-label="Вставка из Wikipedia"`.
2. Capture `selectionStart`, `selectionEnd`, and selected text before opening the dialog.
3. On insert, format with:

```ts
export function formatWikipediaEmbed(text: string, target: WikipediaTarget): string {
  const authorText = text || 'Текст вставки'
  const quote = authorText
    .split('\n')
    .map(line => line ? `> ${line}` : '>')
    .join('\n')
  return `${quote}\n>\n> [Wikipedia: ${target.title}](${target.articleUrl} "wikipedia")`
}
```

4. Insert one blank line before and after when neighboring content is non-empty.
5. Restore focus and select only `authorText` inside the inserted quote.
6. Keep every existing toolbar command unchanged.

- [ ] **Step 5: Run toolbar, renderer, and static checks**

Run:

```bash
npm test -- --runInBand components/nd/MarkdownToolbar.test.tsx components/nd/SummaryMarkdown.test.tsx components/nd/WikipediaEmbed.test.tsx
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

State: `E2E: нужен — добавлен новый modal authoring flow; покрытие Playwright будет в следующем task.`
State: `Wiki: нужна — изменился авторский workflow; обновление в Task 9.`

```bash
git add components/nd/WikipediaInsertDialog.tsx components/nd/MarkdownToolbar.tsx components/nd/MarkdownToolbar.test.tsx
git commit -m "feat: insert Wikipedia widgets from toolbar"
```

---

### Task 8: End-To-End Authoring, Persistence, Preload, And Layout

**Files:**
- Modify: `e2e/book-summaries.spec.ts`
- Modify: `e2e/ui-states.spec.ts`

- [ ] **Step 1: Add the persistent authoring flow to book-summaries E2E**

Before opening preview, intercept the same-origin article API:

```ts
let wikipediaRequests = 0
await page.route('**/api/wikipedia/article?**', async route => {
  wikipediaRequests += 1
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(wikipediaFixture),
  })
})
```

Use the toolbar rather than manually typing the marker:

1. Append `Социализм как способ разрешения противоречий.` to the textarea.
2. Select exactly that sentence with `evaluate(element => element.setSelectionRange(...))`.
3. Open «Вставка из Wikipedia», fill `https://ru.wikipedia.org/wiki/Социализм`, and insert.
4. Wait for autosave, reload, and assert the textarea contains both the author text and `"wikipedia"` source marker.
5. Open preview and use `expect.poll(() => wikipediaRequests).toBeGreaterThan(0)` before clicking the widget, proving preload.
6. Open the widget and assert article title, one paragraph, and «Открыть оригинал».
7. Continue the existing submit/admin-publish/public-page flow and assert the published widget still works.
8. Add a second route fulfillment with `503` and assert author text plus fallback external link remain visible.

- [ ] **Step 2: Add layout proof to ui-states E2E**

Create a dedicated summary draft through existing fixtures, insert the portable Markdown directly, and intercept the article API. In preview:

```ts
const widget = page.locator('.nd-wikipedia-embed')
const followingParagraph = page.getByText('Абзац после Wikipedia-вставки.')
const before = await followingParagraph.boundingBox()
await widget.getByRole('button', { name: /wikipedia/i }).click()
const after = await followingParagraph.boundingBox()
const reader = widget.locator('.nd-wikipedia-embed__reader')
const readerBox = await reader.boundingBox()

expect(before).not.toBeNull()
expect(after).not.toBeNull()
expect(readerBox).not.toBeNull()
expect(after!.y).toBeGreaterThan(before!.y + 200)
expect(readerBox!.height).toBeLessThanOrEqual(900 * 0.64 + 2)
expect(await reader.evaluate(element => element.scrollHeight)).toBeGreaterThan(readerBox!.height)
```

Also assert:

- collapsed hover changes to computed `var(--bg-elevated)` without width/height changes;
- keyboard `Enter` opens and focus remains on the toggle;
- clicking reader text leaves the widget open;
- mobile reader height is bounded by `68svh`.

- [ ] **Step 3: Run the focused E2E suites**

Run:

```bash
npm run test:e2e -- e2e/book-summaries.spec.ts e2e/ui-states.spec.ts
```

Expected: all tests PASS against the isolated E2E Neon branch. No request reaches live Wikipedia because Playwright intercepts the API.

- [ ] **Step 4: Run mandatory pre-commit verification**

Run:

```bash
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:e2e -- e2e/ui-states.spec.ts
```

Expected: 156+ suites PASS and the full UI-state file PASS.

- [ ] **Step 5: Commit Task 8**

State: `E2E: нужен и добавлен — новый modal/persistence/preload flow и CSS layout покрыты Playwright.`
State: `Wiki: нужна — пользовательский workflow документируется следующим commit.`

```bash
git add e2e/book-summaries.spec.ts e2e/ui-states.spec.ts
git commit -m "test: cover Wikipedia summary widgets"
```

---

### Task 9: Documentation And Complete Verification

**Files:**
- Modify: `docs/features/book-summaries.md`
- Modify: `docs/wiki/Book-Summaries.md`

- [ ] **Step 1: Update technical feature documentation**

Add to `docs/features/book-summaries.md`:

- the exact blockquote/link-title Markdown contract;
- any-language HTTPS allowlist and mobile normalization;
- background preload and one-hour cache;
- `/api/wikipedia/article?url=` response role and failure behavior;
- typed-AST security boundary and explicit removed content;
- text/image attribution behavior;
- no DB or audit-table change;
- key new files.

- [ ] **Step 2: Update owner-facing Wiki documentation**

Add to `docs/wiki/Book-Summaries.md`:

- select text → click `W` → paste article URL;
- author text is independent and can be edited freely;
- current Wikipedia article opens inline in reading mode;
- links open Wikipedia in a new tab;
- unavailable articles preserve the author text and source link;
- supported languages and what content is intentionally omitted.

- [ ] **Step 3: Run full local verification from a clean status**

Run:

```bash
git diff --check
npm run lint
npm run typecheck
npm test -- --runInBand
SKIP_ENV_VALIDATION=true DATABASE_URL='postgresql://dummy:dummy@dummy/dummy' npm run build
npm run test:e2e -- e2e/book-summaries.spec.ts e2e/ui-states.spec.ts
```

Expected:

- no whitespace errors;
- lint and typecheck PASS;
- all Jest suites PASS;
- production build PASS;
- both focused Playwright files PASS.

- [ ] **Step 4: Perform manual browser QA**

Start the local server if Playwright has stopped it, then use the in-app browser at desktop `1280x900` and mobile `390x844`. Verify:

- collapsed and open states match the approved flat editorial mockup;
- no content overlap or horizontal scroll;
- author text and article have distinct hierarchy;
- sticky inner bar stays visible while the article scrolls;
- image captions and license links are readable;
- source/fallback links work;
- focus ring and keyboard interaction are visible.

- [ ] **Step 5: Commit documentation**

State: `E2E: нужен и пройден — финальная фича включает новый persistent UI flow и layout.`
State: `Wiki: нужна и обновлена — добавлены авторский и читательский сценарии.`

```bash
git add docs/features/book-summaries.md docs/wiki/Book-Summaries.md
git commit -m "docs: document Wikipedia summary widgets"
```

- [ ] **Step 6: Push one PR and enable auto-merge**

Verify the task worktree and branch before network actions:

```bash
pwd
git status --short --branch
git log --oneline origin/main..HEAD
git push -u origin codex/wikipedia-summary-widget
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,url,mergeStateStatus,mergeable
```

Expected: `mergeStateStatus` is `CLEAN` or `BLOCKED`. If `BEHIND`, run `gh pr update-branch <number>` and let CI restart. If CI fails, fix and push to this same branch. The feature is complete only after the PR is merged into `main` and the production deployment for that merge is `Ready`.

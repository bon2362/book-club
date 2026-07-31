import { request as playwrightRequest, test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createSafeE2EDatabaseClient } from '../lib/e2e-database-guard'

/**
 * Load DATABASE_URL from .env.test.local for use in the Playwright Node.js
 * context (the webServer gets it injected separately via playwright.config.ts).
 */
function loadTestDatabaseUrl(): string | undefined {
  // First check process.env (CI injects it directly)
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const path = resolve(__dirname, '..', '.env.test.local')
  if (!existsSync(path)) return undefined
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key === 'DATABASE_URL') return value
  }
  return undefined
}

const POSTHOG_PATTERNS = [
  '**/eu.i.posthog.com/**',
  '**/eu.posthog.com/**',
  '**/app.posthog.com/**',
]

// =============================================================================
// Test data fixtures
//
// Anything that mutates the DB during a test MUST go through one of these
// fixtures. They guarantee cleanup happens in teardown — even when the test
// body fails — so tests never leak data into the (already isolated) DB.
//
// Pattern: each helper returns the created entity and registers an "undo"
// callback. Teardown drains the callbacks in LIFO order.
// =============================================================================

type IntroSection = {
  id: string
  title: string
  body: string
  sortOrder: number
  isPublished: boolean
}

type IntroSectionOverrides = Partial<Pick<IntroSection, 'title' | 'body' | 'isPublished'>>

type TestBook = {
  id: string
  slug: string | null
  title: string
  author: string
  tags: string[]
  description: string
  pages: number
  publishedDate: string
  textUrl: string
  whyRead: string | null
  recommendationLink: string | null
  visibility: 'published' | 'draft' | 'hidden'
}

type TestBookOverrides = Partial<Pick<TestBook, 'id' | 'slug' | 'title' | 'author' | 'tags' | 'description' | 'pages' | 'publishedDate' | 'textUrl' | 'whyRead' | 'recommendationLink' | 'visibility'>>

type TestPublishedSummary = {
  id: string
  bookId: string
  bookSlug: string
  url: string
}

type TestPublishedSummaryOverrides = {
  displayName?: string
  title?: string
  tldr?: string
  bodyMarkdown?: string
}

type MatchingSession = {
  id: string
  name: string
  minGroupSize: number
  maxGroupSize: number
}

type MatchingSessionOverrides = Partial<Pick<MatchingSession, 'name' | 'minGroupSize' | 'maxGroupSize'>>

interface AdminSession {
  email: string
  name: string
  userId: string
}

interface MatchingBoardParticipant extends AdminSession {
  context: BrowserContext
  page: Page
}

interface MatchingBoardFixture {
  session: MatchingSession
  books: [TestBook, TestBook]
  participantA: MatchingBoardParticipant
  participantB: MatchingBoardParticipant
  addParticipant: (name: string, rankedBooks?: TestBook[]) => Promise<MatchingBoardParticipant>
}

interface MatchingBooksIdentity extends AdminSession {
  request: APIRequestContext
  isAdmin: boolean
}

interface MatchingBooksFixture {
  session: MatchingSession
  books: [TestBook, TestBook]
  participantA: MatchingBooksIdentity
  admin: MatchingBooksIdentity
  getParticipantB: () => Promise<MatchingBooksIdentity>
  getParticipantC: () => Promise<MatchingBooksIdentity>
  addParticipant: (name: string, shortlistedBooks?: TestBook[]) => Promise<MatchingBooksIdentity>
}

interface DbExecHelper {
  /**
   * Execute a raw SQL statement against the e2e database (Node.js context,
   * not the browser). Useful for out-of-band mutations that bypass
   * `withAuditContext` to test trigger-level capture.
   *
   * Cleanup callbacks registered via `registerCleanup` run in LIFO order
   * in teardown — even when the test body fails.
   */
  (sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  registerCleanup: (cleanupSql: string, params?: unknown[]) => void
}

interface AuditCleanupScope {
  trackSession: (sessionId: string) => void
  trackUser: (userId: string) => void
}

export async function cleanupTrackedAuditRows(
  execute: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
  users: string[],
  sessions: string[],
): Promise<void> {
  if (sessions.length === 0 && users.length === 0) return
  if (users.length > 0) {
    await execute('delete from "user" where id = any($1::text[])', [users])
  }
  await execute(
    `delete from audit_log
     where actor_user_id = any($1::text[])
        or entity_id = any($1::text[])
        or exists (
          select 1 from unnest($1::text[]) user_id
          where audit_log.entity_id like user_id || ':%'
        )
        or entity_id = any($2::text[])
        or coalesce(before->>'session_id', '') = any($2::text[])
        or coalesce(after->>'session_id', '') = any($2::text[])
        or exists (
          select 1 from unnest($2::text[]) session_id
          where audit_log.entity_id like session_id || ':%'
        )
        or exists (
          select 1
          from jsonb_each_text(case when jsonb_typeof(before) = 'object' then before else '{}'::jsonb end) ownership(key, value)
          where (ownership.key = 'user_id' or ownership.key like '%\\_user\\_id' escape '\\' or ownership.key like '%\\_by' escape '\\')
            and ownership.value = any($1::text[])
        )
        or exists (
          select 1
          from jsonb_each_text(case when jsonb_typeof(after) = 'object' then after else '{}'::jsonb end) ownership(key, value)
          where (ownership.key = 'user_id' or ownership.key like '%\\_user\\_id' escape '\\' or ownership.key like '%\\_by' escape '\\')
            and ownership.value = any($1::text[])
        )`,
    [users, sessions],
  )
}

type TestTimelineEvent = {
  id: string
  title: string
  description: string
}

type TestTimeline = {
  id: string
  slug: string
  title: string
  description: string
  published: boolean
  /** Точечное событие. */
  pointEvent: TestTimelineEvent
  /** Событие-интервал. */
  intervalEvent: TestTimelineEvent
  epoch: { id: string; title: string }
  url: string
}

type TestTimelineOverrides = Partial<Pick<TestTimeline, 'title' | 'description' | 'published'>>

/**
 * Область имён для строк, которые тест создаёт САМ — через админский интерфейс
 * или админский API. Идентификаторы там выдаёт продукт, поэтому уборка идёт по
 * префиксу названия.
 */
type TimelineAdminScope = {
  /** Префикс, который тест обязан подставлять в названия. */
  prefix: string
  /** Название с префиксом: `scope.name('Тип')`. */
  name: (suffix: string) => string
}


interface E2EHelpers {
  /**
   * Raw-SQL helper against the e2e Neon branch (process.env.DATABASE_URL).
   * Runs in Node.js context (not browser). Registers cleanup callbacks via
   * `dbExec.registerCleanup(sql, params)`.
   */
  dbExec: DbExecHelper
  /** Remove every audit row associated with tracked E2E sessions/users after dependent fixture teardown. */
  auditCleanup: AuditCleanupScope

  /**
   * Log in as a regular user with a unique email derived from the test id.
   * Session is deleted automatically in teardown.
   */
  loginAsUser: (overrides?: { email?: string; name?: string }) => Promise<AdminSession>

  /**
   * Log in as an admin with a unique email derived from the test id.
   * Session is deleted automatically in teardown.
   */
  loginAsAdmin: (overrides?: { email?: string; name?: string }) => Promise<AdminSession>

  /**
   * Create a fresh intro section via the admin API. The section is patched
   * with the requested title/body/isPublished and deleted in teardown —
   * regardless of whether the test passes.
   *
   * Requires an active admin session (call loginAsAdmin first or pass admin=true beforeAll).
   */
  createIntroSection: (overrides?: IntroSectionOverrides) => Promise<IntroSection>

  /**
   * Create a per-test book through /api/test/books. The book is deleted
   * in teardown (cascade removes associated signups/priorities).
   *
   * Each test gets a unique id (`__e2e_book_<testId+random>_<index>__`)
   * so parallel specs do not collide — and so two concurrent CI runs
   * against the same e2e DB do not race on the same primary key.
   *
   * Does NOT require an admin session.
   */
  createTestBook: (overrides?: TestBookOverrides) => Promise<TestBook>

  /**
   * Create a published summary and its isolated author in the E2E Neon branch.
   * Cleanup removes the summary/author; book cleanup cascades helpful reactions.
   */
  createPublishedSummary: (overrides?: TestPublishedSummaryOverrides) => Promise<TestPublishedSummary>

  /**
   * Create an active matching session through a test-only API and delete it in teardown.
   */
  createMatchingSession: (overrides?: MatchingSessionOverrides) => Promise<MatchingSession>

  /**
   * Complete two-person satisfaction board with two shared ranked books.
   * Both browser contexts and user records are cleaned up by the fixture.
   */
  matchingBoardFixture: MatchingBoardFixture
  /**
   * Book-centric matching board initialized in the middle of an already active
   * legacy session. Identities are request-only by default; browser pages and
   * peer participants are created lazily by the tests that need them.
   */
  matchingBooksFixture: MatchingBooksFixture
  /** Open a browser page for a request-only Matching identity on demand. */
  openMatchingPage: (identity: MatchingBooksIdentity) => Promise<Page>

  /**
   * Create an isolated timeline (own event type, two events and one epoch) in
   * the e2e Neon branch. Every row is deleted in teardown; existing timelines
   * are never touched.
   */
  createTestTimeline: (overrides?: TestTimelineOverrides) => Promise<TestTimeline>

  /**
   * Префикс имён для админских сценариев Timeline. Всё, что тест заведёт через
   * интерфейс с этим префиксом (типы, события, эпохи), удаляется в teardown
   * вместе со своими audit-строками. Существующие данные не трогаются.
   */
  timelineAdminScope: TimelineAdminScope
}

async function patchIntroSection(
  request: APIRequestContext,
  id: string,
  overrides: IntroSectionOverrides,
): Promise<void> {
  if (!('title' in overrides) && !('body' in overrides) && !('isPublished' in overrides)) return
  const res = await request.put('/api/admin/intro', {
    data: { patches: [{ id, ...overrides }] },
  })
  if (!res.ok()) {
    throw new Error(`PUT /api/admin/intro failed: ${res.status()} ${await res.text()}`)
  }
}

export const test = base.extend<E2EHelpers>({
  context: async ({ context }, use) => {
    for (const pattern of POSTHOG_PATTERNS) {
      await context.route(pattern, (route) => route.abort())
    }
    await use(context)
  },

  openMatchingPage: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = []
    const pages = new Map<string, Promise<Page>>()
    const open: E2EHelpers['openMatchingPage'] = async (identity) => {
      const existing = pages.get(identity.userId)
      if (existing) return existing
      const pending = (async () => {
        const projectUse = testInfo.project.use
        const context = await browser.newContext({
          ...(projectUse.contextOptions ?? {}),
          baseURL: projectUse.baseURL,
          ignoreHTTPSErrors: projectUse.ignoreHTTPSErrors,
          viewport: projectUse.viewport,
          userAgent: projectUse.userAgent,
          deviceScaleFactor: projectUse.deviceScaleFactor,
          isMobile: projectUse.isMobile,
          hasTouch: projectUse.hasTouch,
          locale: projectUse.locale,
          colorScheme: projectUse.colorScheme,
        })
        contexts.push(context)
        for (const pattern of POSTHOG_PATTERNS) await context.route(pattern, route => route.abort())
        const page = await context.newPage()
        const login = await page.request.post('/api/test/session', {
          data: {
            email: identity.email,
            name: identity.name,
            isAdmin: identity.isAdmin,
            telegramUsername: `matching_page_${identity.userId}`,
          },
        })
        if (!login.ok()) {
          const details = await login.text().catch(() => '')
          throw new Error(`matching page login failed: ${login.status()} ${details}`)
        }
        return page
      })()
      pages.set(identity.userId, pending)
      try {
        return await pending
      } catch (error) {
        // A transient login failure must not poison all later attempts for the
        // same identity with one permanently rejected cached promise.
        if (pages.get(identity.userId) === pending) pages.delete(identity.userId)
        throw error
      }
    }
    await use(open)
    // A test may finish while a lazy setup rejected or is still resolving.
    // Settle every cached setup before closing any of its contexts.
    await Promise.allSettled(Array.from(pages.values()))
    const teardownErrors: unknown[] = []
    for (const context of contexts.reverse()) {
      try {
        await context.close()
      } catch (error) {
        teardownErrors.push(error)
      }
    }
    if (teardownErrors.length > 0) throw new AggregateError(teardownErrors, 'openMatchingPage teardown failed')
  },

  dbExec: async ({}, use) => {
    if (typeof WebSocket === 'undefined') {
      neonConfig.webSocketConstructor = ws
    }
    const connectionString = loadTestDatabaseUrl()
    const pool = createSafeE2EDatabaseClient(
      (safeConnectionString) => new Pool({ connectionString: safeConnectionString }),
      { ...process.env, DATABASE_URL: connectionString },
    )
    const cleanups: Array<{ sql: string; params?: unknown[] }> = []

    const exec = async (sql: string, params?: unknown[]) => {
      const res = await pool.query(sql, params as unknown[] | undefined)
      return res.rows as Record<string, unknown>[]
    }
    exec.registerCleanup = (sql: string, params?: unknown[]) => {
      cleanups.push({ sql, params })
    }

    await use(exec as DbExecHelper)

    // Teardown: run cleanups LIFO
    for (const { sql, params } of cleanups.reverse()) {
      try {
        await pool.query(sql, params as unknown[] | undefined)
      } catch { /* best-effort */ }
    }
    await pool.end()
  },

  auditCleanup: async ({ dbExec }, use) => {
    const sessionIds = new Set<string>()
    const userIds = new Set<string>()
    await use({
      trackSession: (sessionId) => sessionIds.add(sessionId),
      trackUser: (userId) => userIds.add(userId),
    })

    const sessions = Array.from(sessionIds)
    const users = Array.from(userIds)
    // This fixture is a dependency of matching session/board fixtures, so their
    // own teardown runs first. The helper also removes separately-created users
    // before sweeping the trigger rows produced by those deletes.
    await cleanupTrackedAuditRows(dbExec, users, sessions)
  },

  loginAsUser: async ({ page }, use, testInfo) => {
    let count = 0

    const login: E2EHelpers['loginAsUser'] = async (overrides) => {
      const index = count++
      const email = overrides?.email ?? `e2e-${testInfo.testId}-user-${index}@test.invalid`
      const name = overrides?.name ?? `E2E User ${index} ${testInfo.testId}`
      const res = await page.request.post('/api/test/session', {
        data: { email, name, isAdmin: false },
      })
      if (!res.ok()) {
        throw new Error(`/api/test/session failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { userId: string }
      return { email, name, userId: body.userId }
    }

    await use(login)
  },

  loginAsAdmin: async ({ page }, use, testInfo) => {
    const login: E2EHelpers['loginAsAdmin'] = async (overrides) => {
      const email = overrides?.email ?? `e2e-${testInfo.testId}-admin@test.invalid`
      const name = overrides?.name ?? `E2E Admin ${testInfo.testId}`
      const res = await page.request.post('/api/test/session', {
        data: { email, name, isAdmin: true },
      })
      if (!res.ok()) {
        throw new Error(`/api/test/session failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { userId: string }
      return { email, name, userId: body.userId }
    }

    await use(login)
  },

  createIntroSection: async ({ page }, use) => {
    const created: string[] = []

    const create: E2EHelpers['createIntroSection'] = async (overrides) => {
      const res = await page.request.post('/api/admin/intro')
      if (!res.ok()) {
        throw new Error(`POST /api/admin/intro failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { section: IntroSection }
      const section = body.section
      if (overrides) {
        await patchIntroSection(page.request, section.id, overrides)
        Object.assign(section, overrides)
      }
      created.push(section.id)
      return section
    }

    await use(create)

    for (const id of created.reverse()) {
      try {
        await page.request.delete(`/api/admin/intro/${id}`)
      } catch { /* best-effort — DB cleanup is the safety net */ }
    }
  },

  createTestBook: async ({ request }, use, testInfo) => {
    const created: string[] = []
    let nextIndex = 0
    // Suffix должен быть уникален per-test И per-run. testInfo.testId сам
    // по себе детерминирован (один и тот же для теста между запусками),
    // поэтому два параллельных CI run одного теста против одной e2e ветки
    // конфликтуют по primary key `books.id`. Добавляем случайный compо-
    // нент, чтобы это исключить.
    const seed = `${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}`

    const create: E2EHelpers['createTestBook'] = async (overrides) => {
      // Reserve the id synchronously so parallel fixture setup cannot choose
      // the same `created.length` before either request resolves.
      const index = nextIndex++
      const id = overrides?.id ?? `__e2e_book_${seed}_${index}__`
      const title = overrides?.title ?? `E2E Book ${seed} #${index}`
      const res = await request.post('/api/test/books', {
        data: { ...overrides, id, title },
      })
      if (!res.ok()) {
        throw new Error(`POST /api/test/books failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { book: TestBook }
      created.push(body.book.id)
      return body.book
    }

    await use(create)

    for (const id of created.reverse()) {
      try {
        await request.delete('/api/test/books', { data: { id } })
      } catch { /* best-effort — cleanup hooks would still mop up next run */ }
    }
  },

  createPublishedSummary: async ({ createTestBook, dbExec }, use, testInfo) => {
    let count = 0

    const create: E2EHelpers['createPublishedSummary'] = async (overrides) => {
      const suffix = `${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}${count++}`
      const bookSlug = `e2e-helpful-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const book = await createTestBook({
        slug: bookSlug,
        title: `E2E Helpful Book ${suffix}`,
        author: 'E2E Helpful Author',
      })
      const userId = `__e2e_helpful_user_${suffix}__`
      const summaryId = `__e2e_helpful_summary_${suffix}__`

      await dbExec(
        'insert into "user" (id, name, created_at, priorities_set, is_admin) values ($1, $2, now(), false, false)',
        [userId, `E2E Helpful Writer ${suffix}`],
      )
      dbExec.registerCleanup('delete from "user" where id = $1', [userId])

      await dbExec(
        `insert into book_summaries
          (id, book_id, author_user_id, display_name, title, tldr, body_markdown, status, published_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'published', now(), now(), now())`,
        [
          summaryId,
          book.id,
          userId,
          overrides?.displayName ?? 'E2E Helpful Reader',
          overrides?.title ?? 'Полезное саммари',
          overrides?.tldr ?? 'Короткий вывод для проверки реакции.',
          overrides?.bodyMarkdown ?? 'Основной текст саммари для проверки реакции «Полезно».',
        ],
      )
      dbExec.registerCleanup('delete from book_summaries where id = $1', [summaryId])

      return { id: summaryId, bookId: book.id, bookSlug, url: `/books/${bookSlug}/summaries` }
    }

    await use(create)
  },

  createMatchingSession: async ({ request, auditCleanup }, use, testInfo) => {
    const created: string[] = []

    const create: E2EHelpers['createMatchingSession'] = async (overrides) => {
      const res = await request.post('/api/test/matching-session', {
        data: {
          name: overrides?.name ?? `E2E Matching ${testInfo.testId}`,
          minGroupSize: overrides?.minGroupSize ?? 3,
          maxGroupSize: overrides?.maxGroupSize ?? overrides?.minGroupSize ?? 3,
        },
      })
      if (!res.ok()) {
        throw new Error(`POST /api/test/matching-session failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { session: MatchingSession }
      created.push(body.session.id)
      auditCleanup.trackSession(body.session.id)
      return body.session
    }

    await use(create)

    for (const id of created.reverse()) {
      try {
        await request.delete('/api/test/matching-session', { data: { id } })
      } catch { /* best-effort — DB cleanup is the safety net */ }
    }
  },

  matchingBoardFixture: async ({ browser, createMatchingSession, createTestBook, auditCleanup }, use, testInfo) => {
    const contexts: BrowserContext[] = []
    const createdUsers: Array<{ page: Page; email: string }> = []

    try {
      const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
      const books: [TestBook, TestBook] = [
        await createTestBook({ title: `E2E Первый круг ${testInfo.testId}`, author: 'Автор первого круга' }),
        await createTestBook({ title: `E2E Второй круг ${testInfo.testId}`, author: 'Автор второго круга' }),
      ]

      const createParticipant = async (label: string, name: string, rankedBooks: TestBook[] = books): Promise<MatchingBoardParticipant> => {
        const context = await browser.newContext()
        contexts.push(context)
        for (const pattern of POSTHOG_PATTERNS) await context.route(pattern, (route) => route.abort())
        const page = await context.newPage()
        const email = `e2e-${testInfo.testId}-${label}-${Date.now()}@test.invalid`
        const login = await page.request.post('/api/test/session', {
          data: { email, name, isAdmin: false, telegramUsername: `matching_${label.toLowerCase()}_${Date.now()}` },
        })
        if (!login.ok()) throw new Error(`matchingBoardFixture login failed: ${login.status()} ${await login.text()}`)
        // Register cleanup immediately after the user exists: join/add/rank may fail.
        createdUsers.push({ page, email })
        const { userId } = await login.json() as { userId: string }
        auditCleanup.trackUser(userId)
        const join = await page.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name } })
        if (!join.ok()) throw new Error(`matchingBoardFixture join failed: ${join.status()} ${await join.text()}`)
        for (const book of rankedBooks) {
          const add = await page.request.post('/api/matching/books', { data: { bookId: book.id } })
          if (!add.ok()) throw new Error(`matchingBoardFixture add failed: ${add.status()} ${await add.text()}`)
        }
        const rank = await page.request.patch('/api/matching/priorities', { data: { bookIds: rankedBooks.map((book) => book.id) } })
        if (!rank.ok()) throw new Error(`matchingBoardFixture rank failed: ${rank.status()} ${await rank.text()}`)
        return { email, name, userId, context, page }
      }

      const participantA = await createParticipant('A', 'Анна E2E')
      const participantB = await createParticipant('B', 'Борис E2E')
      let extraParticipantIndex = 0
      const addParticipant = (name: string, rankedBooks?: TestBook[]) => (
        createParticipant(`extra-${extraParticipantIndex++}`, name, rankedBooks)
      )

      await use({ session, books, participantA, participantB, addParticipant })
    } finally {
      for (const user of createdUsers.reverse()) {
        try { await user.page.request.delete('/api/test/session', { data: { email: user.email } }) } catch { /* best effort */ }
      }
      for (const context of contexts.reverse()) await context.close().catch(() => {})
    }
  },

  matchingBooksFixture: async ({ createMatchingSession, createTestBook, auditCleanup }, use, testInfo) => {
    const apiContexts: APIRequestContext[] = []
    const createdUsers: Array<{ request: APIRequestContext; email: string }> = []
    const identitySetups: Array<Promise<MatchingBooksIdentity>> = []
    const baseURL = String(testInfo.project.use.baseURL)

    const createIdentity = (
      label: string,
      name: string,
      isAdmin: boolean,
    ): Promise<MatchingBooksIdentity> => {
      const pending = (async () => {
        const request = await playwrightRequest.newContext({ baseURL, ignoreHTTPSErrors: true })
        apiContexts.push(request)
        const email = `e2e-books-${testInfo.testId}-${label}-${Date.now()}@test.invalid`
        const sessionData = {
          email,
          name,
          isAdmin,
          telegramUsername: `matching_books_${label.toLowerCase()}_${Date.now()}`,
        }
        // Register cleanup before login: a failed/partial response may still
        // have created the user row on the server.
        createdUsers.push({ request, email })
        const login = await request.post('/api/test/session', { data: sessionData })
        if (!login.ok()) throw new Error(`matchingBooksFixture login failed: ${login.status()} ${await login.text()}`)
        const { userId } = await login.json() as { userId: string }
        auditCleanup.trackUser(userId)
        return { email, name, userId, request, isAdmin }
      })()
      identitySetups.push(pending)
      return pending
    }

    try {
      const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 5 })
      const books = await Promise.all([
        createTestBook({ title: `E2E Книжный круг A ${testInfo.testId}`, author: 'Автор A' }),
        createTestBook({ title: `E2E Книжный круг B ${testInfo.testId}`, author: 'Автор B' }),
      ]) as [TestBook, TestBook]
      const identityResults = await Promise.allSettled([
        createIdentity('A', 'Анна Книги E2E', false),
        createIdentity('admin', 'Администратор Книги E2E', true),
      ])
      const identityFailure = identityResults.find(result => result.status === 'rejected')
      if (identityFailure?.status === 'rejected') throw identityFailure.reason
      const [participantA, admin] = identityResults.map(result => (
        result as PromiseFulfilledResult<MatchingBooksIdentity>
      ).value)

      // Participants first join the ordinary satisfaction session and set a
      // global shortlist. Only after that does the admin enable book mode.
      const joinParticipant = async (participant: MatchingBooksIdentity, shortlistedBooks: TestBook[] = books) => {
        const join = await participant.request.post(`/api/matching/sessions/${session.id}/join`, {
          data: { name: participant.name },
        })
        if (!join.ok()) throw new Error(`matchingBooksFixture join failed: ${join.status()} ${await join.text()}`)
        for (const book of shortlistedBooks) {
          const add = await participant.request.post('/api/matching/books', { data: { bookId: book.id } })
          if (!add.ok()) throw new Error(`matchingBooksFixture add failed: ${add.status()} ${await add.text()}`)
        }
        const rank = await participant.request.patch('/api/matching/priorities', {
          data: { bookIds: shortlistedBooks.map((book) => book.id) },
        })
        if (!rank.ok()) throw new Error(`matchingBooksFixture rank failed: ${rank.status()} ${await rank.text()}`)
      }
      await joinParticipant(participantA)

      const before = await admin.request.get(`/api/matching/state?session=${session.id}&as=${participantA.userId}`)
      if (!before.ok()) throw new Error(`matchingBooksFixture state failed: ${before.status()} ${await before.text()}`)
      const { session: stateSession } = await before.json() as { session: { stateVersion: number } }
      const initialize = await admin.request.post(
        `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
        { data: { action: 'initializeBookMode', expectedStateVersion: stateSession.stateVersion } },
      )
      if (!initialize.ok()) {
        throw new Error(`matchingBooksFixture initialize failed: ${initialize.status()} ${await initialize.text()}`)
      }

      let extraIndex = 0
      const addParticipant = async (name: string, shortlistedBooks: TestBook[] = books) => {
        const participant = await createIdentity(`extra-${extraIndex++}`, name, false)
        await joinParticipant(participant, shortlistedBooks)
        return participant
      }
      const lazyPeers = new Map<'B' | 'C', Promise<MatchingBooksIdentity>>()
      const getPeer = (label: 'B' | 'C', name: string) => {
        const existing = lazyPeers.get(label)
        if (existing) return existing
        const pending = addParticipant(name)
        lazyPeers.set(label, pending)
        pending.catch(() => lazyPeers.delete(label))
        return pending
      }

      await use({
        session,
        books,
        participantA,
        admin,
        getParticipantB: () => getPeer('B', 'Борис Книги E2E'),
        getParticipantC: () => getPeer('C', 'Вера Книги E2E'),
        addParticipant,
      })
    } finally {
      await Promise.allSettled(identitySetups)
      const teardownErrors: unknown[] = []
      for (const user of createdUsers.reverse()) {
        try {
          const response = await user.request.delete('/api/test/session', { data: { email: user.email } })
          if (!response.ok()) teardownErrors.push(new Error(`matchingBooksFixture cleanup failed: ${response.status()} ${await response.text()}`))
        } catch (error) {
          teardownErrors.push(error)
        }
      }
      for (const request of apiContexts.reverse()) {
        try {
          await request.dispose()
        } catch (error) {
          teardownErrors.push(error)
        }
      }
      if (teardownErrors.length > 0) throw new AggregateError(teardownErrors, 'matchingBooksFixture teardown failed')
    }
  },

  createTestTimeline: async ({ dbExec }, use, testInfo) => {
    let count = 0

    const create: E2EHelpers['createTestTimeline'] = async (overrides) => {
      const suffix = `${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}${count++}`
      const timelineId = `__e2e_timeline_${suffix}__`
      const typeId = `__e2e_timeline_type_${suffix}__`
      const pointId = `__e2e_timeline_point_${suffix}__`
      const intervalId = `__e2e_timeline_interval_${suffix}__`
      const epochId = `__e2e_timeline_epoch_${suffix}__`
      const slug = `e2e-timeline-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const published = overrides?.published ?? true
      const title = overrides?.title ?? `E2E лента ${suffix}`
      const description = overrides?.description ?? 'Лента времени, созданная E2E-фикстурой.'

      await dbExec(
        `insert into historical_event_types (id, title, color, icon) values ($1, $2, '#C0603A', '★')`,
        [typeId, `E2E тип ${suffix}`],
      )
      dbExec.registerCleanup('delete from historical_event_types where id = $1', [typeId])

      const pointEvent: TestTimelineEvent = {
        id: pointId,
        title: `E2E точка ${suffix}`,
        description: `Описание точечного события ${suffix}.`,
      }
      await dbExec(
        `insert into historical_events
           (id, title, event_type_id, start_year, start_era, ongoing, description)
         values ($1, $2, $3, 1917, 'CE', false, $4)`,
        [pointEvent.id, pointEvent.title, typeId, pointEvent.description],
      )
      dbExec.registerCleanup('delete from historical_events where id = $1', [pointEvent.id])

      const intervalEvent: TestTimelineEvent = {
        id: intervalId,
        title: `E2E интервал ${suffix}`,
        description: `Описание события-интервала ${suffix}.`,
      }
      await dbExec(
        `insert into historical_events
           (id, title, event_type_id, start_year, start_era, end_year, end_era, ongoing, description)
         values ($1, $2, $3, 1914, 'CE', 1918, 'CE', false, $4)`,
        [intervalEvent.id, intervalEvent.title, typeId, intervalEvent.description],
      )
      dbExec.registerCleanup('delete from historical_events where id = $1', [intervalEvent.id])

      const epochTitle = `E2E эпоха ${suffix}`
      await dbExec(
        `insert into historical_epochs
           (id, title, start_year, start_era, end_year, end_era, description)
         values ($1, $2, 1900, 'CE', 1950, 'CE', 'Описание эпохи.')`,
        [epochId, epochTitle],
      )
      dbExec.registerCleanup('delete from historical_epochs where id = $1', [epochId])

      await dbExec(
        `insert into timelines (id, slug, title, description, published) values ($1, $2, $3, $4, $5)`,
        [timelineId, slug, title, description, published],
      )
      dbExec.registerCleanup('delete from timelines where id = $1', [timelineId])

      await dbExec(
        `insert into timeline_events (timeline_id, event_id, note) values ($1, $2, ''), ($1, $3, '')`,
        [timelineId, pointEvent.id, intervalEvent.id],
      )
      await dbExec(
        `insert into timeline_epochs (timeline_id, epoch_id, color, visible) values ($1, $2, '#2D6A4F', true)`,
        [timelineId, epochId],
      )
      // Связи уходят каскадом вместе с таймлайном и событиями — отдельная
      // регистрация не нужна, но audit-строки триггеров надо убрать явно.
      dbExec.registerCleanup('delete from audit_log where entity_id = any($1::text[])', [
        [timelineId, typeId, pointEvent.id, intervalEvent.id, epochId],
      ])

      return {
        id: timelineId,
        slug,
        title,
        description,
        published,
        pointEvent,
        intervalEvent,
        epoch: { id: epochId, title: epochTitle },
        url: `/timeline/${slug}`,
      }
    }

    await use(create)
  },

  timelineAdminScope: async ({ dbExec }, use, testInfo) => {
    const prefix = `__e2e_tl_${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}__`
    const like = `${prefix}%`

    // Уборка идёт LIFO, поэтому порядок регистрации обратный порядку удаления:
    // сперва снимаются audit-строки (пока по названиям ещё можно найти id),
    // затем ленты (связи уходят каскадом), затем события, затем эпохи и в самом
    // конце типы — у типов внешний ключ ON DELETE RESTRICT, и удалять их можно
    // только после их событий.
    dbExec.registerCleanup('delete from historical_event_types where title like $1', [like])
    dbExec.registerCleanup('delete from historical_epochs where title like $1', [like])
    dbExec.registerCleanup('delete from historical_events where title like $1', [like])
    dbExec.registerCleanup('delete from timelines where title like $1', [like])
    dbExec.registerCleanup(
      `delete from audit_log where entity_id in (
         select id from historical_events where title like $1
         union all select id from historical_epochs where title like $1
         union all select id from historical_event_types where title like $1
         union all select id from timelines where title like $1
       )`,
      [like],
    )

    await use({ prefix, name: (suffix: string) => `${prefix}${suffix}` })
  },
})

export { expect }
export type { Page }

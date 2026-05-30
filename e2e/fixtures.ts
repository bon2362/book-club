import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

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

type TestBookOverrides = Partial<Pick<TestBook, 'id' | 'title' | 'author' | 'tags' | 'description' | 'pages' | 'publishedDate' | 'textUrl' | 'whyRead' | 'recommendationLink' | 'visibility'>>

type MatchingSession = {
  id: string
  name: string
  targetGroupSize: number
}

type MatchingSessionOverrides = Partial<Pick<MatchingSession, 'name' | 'targetGroupSize'>>

interface AdminSession {
  email: string
  name: string
  userId: string
}

interface E2EHelpers {
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
   * Create an active matching session through a test-only API and delete it in teardown.
   */
  createMatchingSession: (overrides?: MatchingSessionOverrides) => Promise<MatchingSession>
}

type CleanupFn = () => Promise<void>

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

  loginAsUser: async ({ page }, use, testInfo) => {
    const cleanups: CleanupFn[] = []
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
      cleanups.push(async () => {
        await page.request.delete('/api/test/session', { data: { email } })
      })
      return { email, name, userId: body.userId }
    }

    await use(login)

    for (const fn of cleanups.reverse()) {
      try { await fn() } catch { /* best-effort */ }
    }
  },

  loginAsAdmin: async ({ page }, use, testInfo) => {
    const cleanups: CleanupFn[] = []

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
      cleanups.push(async () => {
        await page.request.delete('/api/test/session', { data: { email } })
      })
      return { email, name, userId: body.userId }
    }

    await use(login)

    // LIFO cleanup
    for (const fn of cleanups.reverse()) {
      try { await fn() } catch { /* best-effort */ }
    }
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

  createTestBook: async ({ page }, use, testInfo) => {
    const created: string[] = []
    // Suffix должен быть уникален per-test И per-run. testInfo.testId сам
    // по себе детерминирован (один и тот же для теста между запусками),
    // поэтому два параллельных CI run одного теста против одной e2e ветки
    // конфликтуют по primary key `books.id`. Добавляем случайный compо-
    // нент, чтобы это исключить.
    const seed = `${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 8)}`

    const create: E2EHelpers['createTestBook'] = async (overrides) => {
      const index = created.length
      const id = overrides?.id ?? `__e2e_book_${seed}_${index}__`
      const title = overrides?.title ?? `E2E Book ${seed} #${index}`
      const res = await page.request.post('/api/test/books', {
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
        await page.request.delete('/api/test/books', { data: { id } })
      } catch { /* best-effort — cleanup hooks would still mop up next run */ }
    }
  },

  createMatchingSession: async ({ page }, use, testInfo) => {
    const created: string[] = []

    const create: E2EHelpers['createMatchingSession'] = async (overrides) => {
      const res = await page.request.post('/api/test/matching-session', {
        data: {
          name: overrides?.name ?? `E2E Matching ${testInfo.testId}`,
          targetGroupSize: overrides?.targetGroupSize ?? 3,
        },
      })
      if (!res.ok()) {
        throw new Error(`POST /api/test/matching-session failed: ${res.status()} ${await res.text()}`)
      }
      const body = (await res.json()) as { session: MatchingSession }
      created.push(body.session.id)
      return body.session
    }

    await use(create)

    for (const id of created.reverse()) {
      try {
        await page.request.delete('/api/test/matching-session', { data: { id } })
      } catch { /* best-effort — DB cleanup is the safety net */ }
    }
  },
})

export { expect }
export type { Page }

import type { FullConfig } from '@playwright/test'

// Global setup: seed E2E fixture books once at the start of the test run.
// They live in the DB only for the duration of the run; global teardown deletes them.
//
// This replaces the old in-app auto-seeding on every read of lib/books, which
// caused the test books to leak into the production catalog.
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  const url = `${baseURL.replace(/\/$/, '')}/api/test/seed-books`

  // Retry a few times — the dev server may still be coming up when this runs.
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST' })
      if (res.ok) return
      if (res.status === 403) {
        throw new Error('seed-books returned 403 — is NEXTAUTH_TEST_MODE=true on the dev server?')
      }
      lastError = new Error(`seed-books returned ${res.status}`)
    } catch (e) {
      lastError = e
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw lastError ?? new Error('global-setup: could not reach seed-books endpoint')
}

import type { FullConfig } from '@playwright/test'
import { callTestEndpoint, cleanupE2EUsers } from './test-cleanup'

// Global setup: seed E2E fixture books once at the start of the test run.
// They live in the DB only for the duration of the run; global teardown deletes them.
//
// This replaces the old in-app auto-seeding on every read of lib/books, which
// caused the test books to leak into the production catalog.
export default async function globalSetup(config: FullConfig) {
  // Retry a few times — the dev server may still be coming up when this runs.
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await cleanupE2EUsers(config)
      await callTestEndpoint(config, '/api/test/seed-books', 'POST')
      return
    } catch (e) {
      lastError = e
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw lastError ?? new Error('global-setup: could not reach seed-books endpoint')
}

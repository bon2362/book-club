import type { FullConfig } from '@playwright/test'
import { cleanupE2EUsers } from './test-cleanup'

// Global setup: clean up any E2E users left behind by a previous run.
//
// Per-test books / intro sections / sessions are created and removed by
// fixtures in e2e/fixtures.ts. There are no more global seed books — each
// spec creates its own via createTestBook fixture.
export default async function globalSetup(config: FullConfig) {
  // Retry a few times — the dev server may still be coming up when this runs.
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await cleanupE2EUsers(config)
      return
    } catch (e) {
      lastError = e
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw lastError ?? new Error('global-setup: could not reach cleanup-users endpoint')
}

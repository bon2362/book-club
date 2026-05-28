import type { FullConfig } from '@playwright/test'
import { cleanupE2EUsers } from './test-cleanup'

// Global teardown: clean up E2E users from the shared DB. Books, intro
// sections and other per-test entities are removed by their fixtures.
export default async function globalTeardown(config: FullConfig) {
  await cleanupE2EUsers(config)
}

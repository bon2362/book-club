import type { FullConfig } from '@playwright/test'
import { callTestEndpoint, cleanupE2EUsers } from './test-cleanup'

// Global teardown: remove E2E fixture books and users from the shared DB.
// Fail loudly if cleanup breaks so CI cannot silently leak test data.
export default async function globalTeardown(config: FullConfig) {
  await callTestEndpoint(config, '/api/test/seed-books', 'DELETE')
  await cleanupE2EUsers(config)
}

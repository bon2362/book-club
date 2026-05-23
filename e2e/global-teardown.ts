import type { FullConfig } from '@playwright/test'

// Global teardown: remove the E2E fixture books from the shared DB so the
// production catalog never sees them. Best-effort — even on failure we don't
// block the suite from finishing.
export default async function globalTeardown(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  const url = `${baseURL.replace(/\/$/, '')}/api/test/seed-books`
  try {
    await fetch(url, { method: 'DELETE' })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('global-teardown: failed to call seed-books DELETE:', e)
  }
}

import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

// Opt-in archive runner. It is intentionally not part of the default config,
// so nightly cannot accidentally restore the historical 40-minute portfolio.
export default defineConfig({
  ...baseConfig,
  projects: [{
    name: 'matching-manual',
    testMatch: '**/matching-*.spec.ts',
    use: { ...devices['Desktop Chrome'] },
  }],
})

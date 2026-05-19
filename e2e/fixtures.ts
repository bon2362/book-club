import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const POSTHOG_PATTERNS = [
  '**/eu.i.posthog.com/**',
  '**/eu.posthog.com/**',
  '**/app.posthog.com/**',
]

export const test = base.extend({
  context: async ({ context }, use) => {
    for (const pattern of POSTHOG_PATTERNS) {
      await context.route(pattern, (route) => route.abort())
    }
    await use(context)
  },
})

export { expect }
export type { Page }

import { request, type FullConfig } from '@playwright/test'

export function getBaseURL(config: FullConfig) {
  return config.projects[0]?.use?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
}

export async function callTestEndpoint(config: FullConfig, path: string, method: 'POST' | 'DELETE') {
  const baseURL = getBaseURL(config).replace(/\/$/, '')
  const context = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: baseURL.startsWith('https://'),
  })
  try {
    const res = await context.fetch(path, { method })
    if (!res.ok()) {
      const body = await res.text().catch(() => '')
      throw new Error(`${method} ${path} returned ${res.status()}${body ? `: ${body}` : ''}`)
    }
  } finally {
    await context.dispose()
  }
}

export async function cleanupE2EUsers(config: FullConfig) {
  await callTestEndpoint(config, '/api/test/cleanup-users', 'DELETE')
}

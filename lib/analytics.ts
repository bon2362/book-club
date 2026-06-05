import posthog from 'posthog-js'

type EventProps = Record<string, string | number | boolean | undefined | null>

let initialized = false
let currentIdentity: string | null = null
const SENSITIVE_QUERY_KEYS = new Set(['token', 'uid', 'ts', 'username', 'preauth', 'email'])

export function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
    respect_dnt: true,
  })
  initialized = true
}

export function isPostHogReady(): boolean {
  return initialized
}

export function track(event: string, properties?: EventProps): void {
  if (typeof window === 'undefined' || !initialized) return
  posthog.capture(event, properties)
}

export function capturePageview(url: string): void {
  if (typeof window === 'undefined' || !initialized) return
  posthog.capture('$pageview', { $current_url: sanitizeAnalyticsUrl(url) })
}

export function sanitizeAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) parsed.searchParams.delete(key)
    }
    const query = parsed.searchParams.toString()
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`
  } catch {
    return url
  }
}

export function identifyUser(userId: string): void {
  if (typeof window === 'undefined') return
  initPostHog() // ensure init before identify, even if parent useEffect hasn't fired yet
  if (!initialized) return
  if (currentIdentity === userId) return
  posthog.identify(userId)
  currentIdentity = userId
}

export function resetIdentity(): void {
  if (typeof window === 'undefined' || !initialized) return
  if (currentIdentity === null) return
  posthog.reset()
  currentIdentity = null
}

export function __resetForTesting(): void {
  initialized = false
  currentIdentity = null
}

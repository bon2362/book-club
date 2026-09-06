import posthog from 'posthog-js'

type EventProps = Record<string, string | number | boolean | undefined | null>

let initialized = false
let currentIdentity: string | null = null
const SENSITIVE_QUERY_KEYS = new Set(['token', 'uid', 'ts', 'username', 'preauth', 'email'])
const LAST_IDENTITY_STORAGE_KEY = 'bc_last_identity'

type StoredIdentity = {
  userId: string
  provider: string | null
}

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
    advanced_disable_flags: true,
    // No session replay: the project owner explicitly opted out (too sensitive).
    capture_exceptions: true,
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

function readStoredIdentity(): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(LAST_IDENTITY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.userId === 'string') {
      return { userId: parsed.userId, provider: typeof parsed.provider === 'string' ? parsed.provider : null }
    }
    return null
  } catch {
    return null
  }
}

function writeStoredIdentity(identity: StoredIdentity): void {
  try {
    window.localStorage.setItem(LAST_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // localStorage unavailable (private mode, blockers) — detector silently degrades
  }
}

export function identifyUser(userId: string, provider?: string | null): void {
  if (typeof window === 'undefined') return
  initPostHog() // ensure init before identify, even if parent useEffect hasn't fired yet
  if (!initialized) return

  const normalizedProvider = provider ?? null
  const previous = readStoredIdentity()
  if (previous && previous.userId !== userId) {
    posthog.capture('account_duplicate_suspected', {
      previous_user_id: previous.userId,
      new_user_id: userId,
      previous_provider: previous.provider,
      new_provider: normalizedProvider,
    })
  }
  writeStoredIdentity({ userId, provider: normalizedProvider })

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

import { PostHog } from 'posthog-node'

/**
 * Server-side helpers for PostHog. Used to honor "right to be forgotten"
 * (ZZPL Article 30 / GDPR Article 17) by removing a user's PostHog profile
 * when the account is deleted on our side.
 *
 * Requires POSTHOG_PERSONAL_API_KEY with scope `person:write` (which covers
 * delete-by-distinct-id).
 */

let client: PostHog | null = null

/**
 * True when server-side capture must stay a no-op: no project token
 * configured, running under E2E test mode, or analytics explicitly
 * disabled. This is the guard that keeps nightly E2E runs from polluting
 * the production PostHog project.
 */
function isDisabled(): boolean {
  return (
    !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    process.env.NEXTAUTH_TEST_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === 'true'
  )
}

/**
 * Lazily creates (or reuses) the module-level PostHog client. Configured for
 * serverless: `flushAt: 1` + `flushInterval: 0` send every capture/identify
 * immediately instead of batching, since a Vercel function can be frozen or
 * torn down before a batched flush would fire.
 */
function getClient(): PostHog {
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN as string, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return client
}

/**
 * Captures a server-side event for `distinctId`. Best-effort: any failure
 * (misconfiguration, network error) is caught and logged, never thrown —
 * analytics must not break the request that triggered it.
 *
 * No-op when `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is unset, when
 * `NEXTAUTH_TEST_MODE === 'true'`, or when
 * `NEXT_PUBLIC_DISABLE_ANALYTICS === 'true'` — this keeps nightly E2E runs
 * from writing into the production PostHog project.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (isDisabled()) return

  try {
    const posthog = getClient()
    posthog.capture({ distinctId, event, properties })
    await posthog.flush()
  } catch (error) {
    console.error('[posthog-server] captureServerEvent failed', error)
  }
}

/**
 * Sets person properties for `distinctId` via PostHog's `identify`.
 *
 * PRIVACY: this helper is generic, but callers must NEVER pass email as a
 * property — only non-PII-adjacent fields the project owner approved
 * (name, telegram_username, providers, created_at, is_admin, etc.).
 *
 * Same no-op / best-effort guarantees as `captureServerEvent`.
 */
export async function setPersonProperties(
  distinctId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  if (isDisabled()) return

  try {
    const posthog = getClient()
    posthog.identify({ distinctId, properties })
    await posthog.flush()
  } catch (error) {
    console.error('[posthog-server] setPersonProperties failed', error)
  }
}

/**
 * Resets the module-level client singleton. Test-only — mirrors
 * `__resetForTesting` in `lib/analytics.ts`.
 */
export function __resetForTesting(): void {
  client = null
}

export async function deletePostHogPerson(distinctId: string): Promise<void> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com'

  if (!apiKey || !projectId) {
    // Not configured — silently skip. The account deletion on our side
    // still succeeds; PostHog will retain anonymous behavior under uuid
    // until natural data retention (7 years by default).
    return
  }

  try {
    await fetch(
      `${host}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}&delete_events=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      },
    )
  } catch {
    // Best-effort. Account deletion is more important than PostHog cleanup —
    // do not propagate errors back to the user.
  }
}

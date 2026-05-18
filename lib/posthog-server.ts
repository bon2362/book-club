/**
 * Server-side helpers for PostHog. Used to honor "right to be forgotten"
 * (ZZPL Article 30 / GDPR Article 17) by removing a user's PostHog profile
 * when the account is deleted on our side.
 *
 * Requires POSTHOG_PERSONAL_API_KEY with scope `person:write` (which covers
 * delete-by-distinct-id).
 */

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

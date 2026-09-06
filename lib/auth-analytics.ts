import { captureServerEvent, setPersonProperties } from '@/lib/posthog-server'

/**
 * Thin, purpose-built wrapper around `lib/posthog-server.ts` for auth/identity
 * events (see docs/planning-artifacts/2026-09-06-posthog-personalization-plan.md,
 * этап 1). Keeps event names/property shapes in one place and adds a second
 * best-effort guard on top of `captureServerEvent`/`setPersonProperties`
 * (which already swallow their own errors): a bug in this file itself (e.g. a
 * null property access while shaping properties) must still never break
 * sign-in, identity linking, or account merges.
 *
 * PRIVACY: none of the functions below accept or forward email. Callers must
 * not add it.
 */

/** How the user in `auth_succeeded` ended up resolved to this account. */
export type AuthLinkedBy = 'identity' | 'email' | 'new'

export async function trackAuthSucceeded(
  distinctId: string,
  provider: string,
  isNewUser: boolean,
  linkedBy: AuthLinkedBy,
): Promise<void> {
  try {
    await captureServerEvent(distinctId, 'auth_succeeded', {
      provider,
      is_new_user: isNewUser,
      linked_by: linkedBy,
    })
  } catch (error) {
    console.error('[auth-analytics] trackAuthSucceeded failed', error)
  }
}

/**
 * `distinctId` may be unknown at the point a sign-in fails (e.g. a brand new
 * visitor whose magic-link resolution never produced a users.id). Passing
 * `null`/`undefined` is a deliberate no-op — we never fabricate an identifier
 * (such as using the raw email) to force an event through.
 */
export async function trackAuthFailed(
  distinctId: string | null | undefined,
  provider: string,
  reason: string,
): Promise<void> {
  if (!distinctId) return
  try {
    await captureServerEvent(distinctId, 'auth_failed', { provider, reason })
  } catch (error) {
    console.error('[auth-analytics] trackAuthFailed failed', error)
  }
}

export async function trackIdentityConflict(
  provider: string,
  attemptingUserId: string,
  existingUserId: string | null,
): Promise<void> {
  try {
    await captureServerEvent(attemptingUserId, 'identity_conflict', {
      provider,
      user_id: attemptingUserId,
      existing_user_id: existingUserId,
    })
  } catch (error) {
    console.error('[auth-analytics] trackIdentityConflict failed', error)
  }
}

export async function trackAccountsMerged(
  targetUserId: string,
  sourceUserId: string,
  movedCount: number,
  actorUserId?: string | null,
): Promise<void> {
  try {
    await captureServerEvent(targetUserId, 'accounts_merged', {
      source_user_id: sourceUserId,
      target_user_id: targetUserId,
      moved_count: movedCount,
      actor_user_id: actorUserId ?? null,
    })
  } catch (error) {
    console.error('[auth-analytics] trackAccountsMerged failed', error)
  }
}

export interface LoginPersonProperties {
  name: string | null
  telegramUsername: string | null
  providers: string[]
  createdAt: Date | null
  isAdmin: boolean
}

/**
 * PRIVACY: intentionally has no `email` field on `LoginPersonProperties` —
 * this is the enforced shape, not just a runtime filter.
 */
export async function applyLoginPersonProperties(
  distinctId: string,
  props: LoginPersonProperties,
): Promise<void> {
  try {
    await setPersonProperties(distinctId, {
      name: props.name,
      telegram_username: props.telegramUsername,
      providers: props.providers,
      created_at: props.createdAt ? props.createdAt.toISOString() : null,
      is_admin: props.isAdmin,
    })
  } catch (error) {
    console.error('[auth-analytics] applyLoginPersonProperties failed', error)
  }
}

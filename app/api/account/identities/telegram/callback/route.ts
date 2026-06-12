import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { verifyTelegramAccountLinkState } from '@/lib/account-linking-state'
import { verifyTelegramHashWithReason } from '@/lib/telegram-auth'
import { IdentityConflictError, linkVerifiedIdentityToUser } from '@/lib/user-identities'

function redirectWithStatus(origin: string, status: string) {
  const url = new URL('/', origin)
  url.searchParams.set('account_link', status)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  const { searchParams, origin } = new URL(req.url)
  if (!userId) {
    return redirectWithStatus(origin, 'telegram_unauthorized')
  }

  const state = searchParams.get('state')
  if (!verifyTelegramAccountLinkState(state, userId)) {
    return redirectWithStatus(origin, 'telegram_state_failed')
  }

  const params = Object.fromEntries(searchParams)
  delete params.state
  const verdict = verifyTelegramHashWithReason(params)
  if (!verdict.ok) {
    console.error('[telegram-link-callback] verification failed', {
      reason: verdict.reason,
      skewSeconds: verdict.skewSeconds,
      hasHash: Boolean(params.hash),
      tgId: params.id ?? null,
      authDate: params.auth_date ?? null,
    })
    return redirectWithStatus(origin, 'telegram_failed')
  }

  const { id, first_name, last_name, username, photo_url } = params
  if (!id) {
    return redirectWithStatus(origin, 'telegram_failed')
  }

  const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)
  const now = new Date()

  try {
    await withAuditContext(
      {
        actorUserId: userId,
        actorLabel: session.user?.name ?? session.user?.email ?? session.user?.contactEmail ?? null,
        source: 'account-linking',
      },
      async (tx) => linkVerifiedIdentityToUser(userId, 'telegram', id, {
        name,
        image: photo_url || null,
        telegramUsername: username || null,
        now,
        metadata: { source: 'account-linking-telegram' },
      }, tx),
    )
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return redirectWithStatus(origin, 'telegram_conflict')
    }
    throw error
  }

  return redirectWithStatus(origin, 'telegram_ok')
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { consumeEmailAccountLinkToken, parseEmailAccountLinkIdentifier } from '@/lib/account-email-linking'
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
    return redirectWithStatus(origin, 'email_unauthorized')
  }

  const identifier = searchParams.get('identifier')
  const token = searchParams.get('token')
  const linkPayload = parseEmailAccountLinkIdentifier(identifier)

  if (!linkPayload) {
    return redirectWithStatus(origin, 'email_failed')
  }

  if (linkPayload.userId !== userId) {
    return redirectWithStatus(origin, 'email_state_failed')
  }

  const now = new Date()
  try {
    const linked = await withAuditContext(
      {
        actorUserId: userId,
        actorLabel: session.user?.name ?? session.user?.email ?? session.user?.contactEmail ?? null,
        source: 'account-linking',
      },
      async (tx) => {
        const consumed = await consumeEmailAccountLinkToken(identifier, token, tx)
        if (!consumed) return false
        await linkVerifiedIdentityToUser(userId, 'email', consumed.email, {
          email: consumed.email,
          emailVerified: true,
          name: session.user?.name ?? consumed.email,
          now,
          metadata: { source: 'account-linking-email' },
        }, tx)
        return true
      },
    )
    if (!linked) {
      return redirectWithStatus(origin, 'email_failed')
    }
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return redirectWithStatus(origin, 'email_conflict')
    }
    throw error
  }

  return redirectWithStatus(origin, 'email_ok')
}

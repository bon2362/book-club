import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramHashWithReason, recordTelegramLoginFailure } from '@/lib/telegram-auth'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { issueServerSession } from '@/lib/auth-session'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const params = Object.fromEntries(searchParams)

  const verdict = verifyTelegramHashWithReason(params)
  if (!verdict.ok) {
    console.error('[telegram-callback] verification failed', {
      reason: verdict.reason,
      skewSeconds: verdict.skewSeconds,
      hasHash: Boolean(params.hash),
      tgId: params.id ?? null,
      authDate: params.auth_date ?? null,
    })
    await recordTelegramLoginFailure({
      reason: verdict.reason ?? 'unknown',
      skewSeconds: verdict.skewSeconds,
      tgId: params.id ?? null,
      tgUsername: params.username ?? null,
      hasHash: Boolean(params.hash),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })
    return NextResponse.redirect(new URL('/?auth=failed', origin))
  }

  const { id, first_name, last_name, username, photo_url } = params
  const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)

  try {
    const user = await resolveOrCreateUserFromIdentity('telegram', id, {
      name,
      image: photo_url || null,
      telegramUsername: username || null,
      metadata: { source: 'telegram-callback' },
    })
    const res = NextResponse.redirect(new URL('/', origin))
    await issueServerSession(res,
      { userId: user.id, email: user.contactEmail, name: user.name ?? name, provider: 'telegram' },
      { secure: origin.startsWith('https') })
    console.log('[telegram-callback] ok', { userId: user.id, tgId: id })
    return res
  } catch (e) {
    console.error('[telegram-callback] session issue failed', { errorName: (e as Error)?.name })
    return NextResponse.redirect(new URL('/?auth=failed', origin))
  }
}

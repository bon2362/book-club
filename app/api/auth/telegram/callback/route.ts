import { NextRequest, NextResponse } from 'next/server'
import { createTelegramPreauthToken, recordTelegramLoginFailure, verifyTelegramHashWithReason } from '@/lib/telegram-auth'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

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

  const user = await resolveOrCreateUserFromIdentity('telegram', id, {
    name,
    image: photo_url || null,
    telegramUsername: username || null,
    metadata: { source: 'telegram-callback' },
  })

  const ts = String(Math.floor(Date.now() / 1000))
  const { token } = await createTelegramPreauthToken(user.id)
  console.log('[telegram-callback] ok', { userId: user.id, tgId: id })

  const url = new URL('/auth/telegram', origin)
  url.searchParams.set('token', token)
  url.searchParams.set('ts', ts)

  return NextResponse.redirect(url)
}

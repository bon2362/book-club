import { NextRequest, NextResponse } from 'next/server'
import { createTelegramPreauthToken, verifyTelegramHash } from '@/lib/telegram-auth'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const params = Object.fromEntries(searchParams)

  if (!verifyTelegramHash(params)) {
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

  const url = new URL('/auth/telegram', origin)
  url.searchParams.set('token', token)
  url.searchParams.set('ts', ts)

  return NextResponse.redirect(url)
}

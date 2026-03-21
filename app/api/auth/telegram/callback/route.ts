import { NextRequest, NextResponse } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

function verifyTelegramHash(data: Record<string, string>): boolean {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false
  const { hash, ...rest } = data
  if (!hash) return false
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))
  } catch { return false }
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const params = Object.fromEntries(searchParams)

  if (!verifyTelegramHash(params)) {
    return NextResponse.redirect(new URL('/?auth=failed', origin))
  }

  const { id, first_name, last_name, username, photo_url } = params
  const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)
  const email = `telegram:${id}@telegram.user`
  const userId = `telegram:${id}`

  await db.insert(users).values({ id: userId, email, name, image: photo_url || null })
    .onConflictDoUpdate({ target: users.id, set: { name, image: photo_url || null } })

  const ts = String(Math.floor(Date.now() / 1000))
  const secret = (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)!
  const token = createHmac('sha256', secret).update(`${userId}:${ts}`).digest('hex')

  const url = new URL('/auth/telegram', origin)
  url.searchParams.set('uid', userId)
  url.searchParams.set('token', token)
  url.searchParams.set('ts', ts)

  return NextResponse.redirect(url)
}

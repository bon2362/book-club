import { NextRequest, NextResponse } from 'next/server'
import { consumeTelegramPreauthToken, recordTelegramLoginFailure } from '@/lib/telegram-auth'
import { issueServerSession } from '@/lib/auth-session'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const token = searchParams.get('token')
  const userId = token ? await consumeTelegramPreauthToken(token) : null
  if (!userId) {
    await recordTelegramLoginFailure({ reason: 'bot_token_invalid', hasHash: false, ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null })
    return NextResponse.redirect(new URL('/?auth=failed', origin))
  }
  const [u] = await db.select({ name: users.name, contactEmail: users.contactEmail }).from(users).where(eq(users.id, userId)).limit(1)
  const res = NextResponse.redirect(new URL('/', origin))
  await issueServerSession(res, { userId, name: u?.name ?? null, email: u?.contactEmail ?? null, provider: 'telegram' }, { secure: origin.startsWith('https') })
  console.log('[telegram-login] ok', { userId })
  return res
}

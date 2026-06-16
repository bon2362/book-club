import { NextRequest, NextResponse } from 'next/server'
import { consumeTelegramPreauthToken } from '@/lib/telegram-auth'
import { issueServerSession } from '@/lib/auth-session'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const nonce = searchParams.get('nonce')
  if (!nonce) return NextResponse.json({ status: 'pending' })
  const userId = await consumeTelegramPreauthToken(nonce)
  if (!userId) return NextResponse.json({ status: 'pending' })
  const [u] = await db.select({ name: users.name, contactEmail: users.contactEmail }).from(users).where(eq(users.id, userId)).limit(1)
  const res = NextResponse.json({ status: 'ok' })
  await issueServerSession(res, { userId, name: u?.name ?? null, email: u?.contactEmail ?? null, provider: 'telegram' }, { secure: origin.startsWith('https') })
  console.log('[telegram-poll] ok', { userId })
  return res
}

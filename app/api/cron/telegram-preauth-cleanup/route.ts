import { NextResponse } from 'next/server'
import { cleanupTelegramLoginFailures, cleanupTelegramPreauthTokens } from '@/lib/telegram-auth'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 401 })
  }

  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await cleanupTelegramLoginFailures()
  await cleanupTelegramPreauthTokens()
  return NextResponse.json({ ok: true })
}

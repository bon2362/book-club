import { NextRequest, NextResponse } from 'next/server'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { bindTelegramLoginNonce } from '@/lib/telegram-auth'
import { sendTelegramMessage } from '@/lib/telegram-bot'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let update: { message?: { text?: string; from?: { id?: number; first_name?: string; last_name?: string; username?: string } } }
  try { update = await req.json() } catch { return NextResponse.json({ ok: true }) }
  const msg = update?.message
  const text = msg?.text ?? ''
  const from = msg?.from
  if (!from?.id || !text.startsWith('/start')) return NextResponse.json({ ok: true })
  const nonce = text.trim().split(/\s+/)[1]
  try {
    if (!nonce) {
      await sendTelegramMessage(from.id, 'Откройте slowreading.club и нажмите «Войти через Telegram».')
      return NextResponse.json({ ok: true })
    }
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id)
    const user = await resolveOrCreateUserFromIdentity('telegram', String(from.id), {
      name, telegramUsername: from.username ?? null, metadata: { source: 'telegram-bot' },
    })
    await bindTelegramLoginNonce(nonce, user.id)
    await sendTelegramMessage(from.id, '✅ Готово! Вернитесь в браузер — вы уже вошли.')
    console.log('[telegram-webhook] ok', { userId: user.id, tgId: String(from.id) })
  } catch (e) {
    console.error('[telegram-webhook] error', { errorName: (e as Error)?.name })
    await sendTelegramMessage(from.id, 'Не удалось войти, попробуйте позже.')
  }
  return NextResponse.json({ ok: true })
}

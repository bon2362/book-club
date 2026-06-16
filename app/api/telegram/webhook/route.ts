import { NextRequest, NextResponse } from 'next/server'
import { resolveOrCreateUserFromIdentity, linkVerifiedIdentityToUser, IdentityConflictError } from '@/lib/user-identities'
import { bindTelegramLoginNonce, consumeTelegramPreauthToken } from '@/lib/telegram-auth'
import { sendTelegramMessage } from '@/lib/telegram-bot'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export const dynamic = 'force-dynamic'

const LINK_PREFIX = 'link_'

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
  const payload = text.trim().split(/\s+/)[1]
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id)
  try {
    if (!payload) {
      await sendTelegramMessage(from.id, 'Откройте slowreading.club и нажмите «Войти через Telegram».')
      return NextResponse.json({ ok: true })
    }

    // ── Привязка Telegram к существующему аккаунту (из профиля) ──
    if (payload.startsWith(LINK_PREFIX)) {
      const targetUserId = await consumeTelegramPreauthToken(payload.slice(LINK_PREFIX.length))
      if (!targetUserId) {
        await sendTelegramMessage(from.id, 'Ссылка устарела. Откройте профиль и нажмите «Привязать» ещё раз.')
        return NextResponse.json({ ok: true })
      }
      try {
        await withAuditContext(
          { actorUserId: targetUserId, source: 'account-linking-bot' },
          (tx) => linkVerifiedIdentityToUser(targetUserId, 'telegram', String(from.id), {
            name, image: null, telegramUsername: from.username ?? null, now: new Date(),
            metadata: { source: 'account-linking-bot' },
          }, tx),
        )
      } catch (e) {
        if (e instanceof IdentityConflictError) {
          await sendTelegramMessage(from.id, 'Этот Telegram уже привязан к другому аккаунту.')
          return NextResponse.json({ ok: true })
        }
        throw e
      }
      await sendTelegramMessage(from.id, '✅ Telegram привязан! Вернитесь в браузер.')
      console.log('[telegram-webhook] link ok', { userId: targetUserId, tgId: String(from.id) })
      return NextResponse.json({ ok: true })
    }

    // ── Вход (поллинг) ──
    const user = await resolveOrCreateUserFromIdentity('telegram', String(from.id), {
      name, telegramUsername: from.username ?? null, metadata: { source: 'telegram-bot' },
    })
    await bindTelegramLoginNonce(payload, user.id)
    await sendTelegramMessage(from.id, '✅ Готово! Вернитесь в браузер — вы уже вошли.')
    console.log('[telegram-webhook] ok', { userId: user.id, tgId: String(from.id) })
  } catch (e) {
    console.error('[telegram-webhook] error', { errorName: (e as Error)?.name })
    await sendTelegramMessage(from.id, 'Не удалось, попробуйте позже.')
  }
  return NextResponse.json({ ok: true })
}

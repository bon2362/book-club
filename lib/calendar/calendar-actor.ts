import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram-miniapp-auth'
import { db } from '@/lib/db'
import { userIdentities, users } from '@/lib/db/schema'

export type CalendarActor = {
  userId: string
  name: string | null
  isAdmin: boolean
  source: 'admin' | 'calendar' | 'telegram-miniapp' | 'telegram-bot'
}

export class TelegramCalendarActorError extends Error {
  constructor(public readonly code: 'invalid_telegram_init_data' | 'telegram_identity_not_linked') { super(code) }
}

/**
 * Единственный поиск уже привязанного Telegram identity. Новый аккаунт здесь
 * не создаётся ни для Mini App, ни для webhook-кнопок: незнакомый Telegram ID
 * получает `telegram_identity_not_linked`.
 */
async function findLinkedTelegramActor(telegramUserId: string, source: CalendarActor['source']): Promise<CalendarActor> {
  const [identity] = await db.select({ userId: userIdentities.userId, name: users.name, isAdmin: users.isAdmin })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, 'telegram'), eq(userIdentities.providerAccountId, telegramUserId)))
    .limit(1)
  if (!identity) throw new TelegramCalendarActorError('telegram_identity_not_linked')
  return { ...identity, source }
}

export async function resolveTelegramCalendarActor(req: NextRequest): Promise<CalendarActor> {
  const authorization = req.headers.get('authorization')
  const match = authorization?.match(/^tma\s+(.+)$/i)
  if (!match) throw new TelegramCalendarActorError('invalid_telegram_init_data')
  try {
    const initData = await verifyTelegramMiniAppInitData(match[1])
    return await findLinkedTelegramActor(initData.telegramUserId, 'telegram-miniapp')
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) throw error
    throw new TelegramCalendarActorError('invalid_telegram_init_data')
  }
}

/**
 * Telegram ID из апдейта Bot API. Подлинность апдейта уже подтверждена секретом
 * webhook (`X-Telegram-Bot-Api-Secret-Token`), поэтому здесь нужна только привязка.
 */
export async function resolveTelegramBotCalendarActor(telegramUserId: string): Promise<CalendarActor> {
  if (!/^\d{1,20}$/.test(telegramUserId)) throw new TelegramCalendarActorError('telegram_identity_not_linked')
  return findLinkedTelegramActor(telegramUserId, 'telegram-bot')
}

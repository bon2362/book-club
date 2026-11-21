import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram-miniapp-auth'
import { db } from '@/lib/db'
import { userIdentities, users } from '@/lib/db/schema'

export type CalendarActor = {
  userId: string
  name: string | null
  isAdmin: boolean
  source: 'calendar' | 'telegram-miniapp'
}

export class TelegramCalendarActorError extends Error {
  constructor(public readonly code: 'invalid_telegram_init_data' | 'telegram_identity_not_linked') { super(code) }
}

export async function resolveTelegramCalendarActor(req: NextRequest): Promise<CalendarActor> {
  const authorization = req.headers.get('authorization')
  const match = authorization?.match(/^tma\s+(.+)$/i)
  if (!match) throw new TelegramCalendarActorError('invalid_telegram_init_data')
  try {
    const initData = await verifyTelegramMiniAppInitData(match[1])
    const [identity] = await db.select({ userId: userIdentities.userId, name: users.name, isAdmin: users.isAdmin })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(and(eq(userIdentities.provider, 'telegram'), eq(userIdentities.providerAccountId, initData.telegramUserId)))
      .limit(1)
    if (!identity) throw new TelegramCalendarActorError('telegram_identity_not_linked')
    return { ...identity, source: 'telegram-miniapp' }
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) throw error
    throw new TelegramCalendarActorError('invalid_telegram_init_data')
  }
}

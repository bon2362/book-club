import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { telegramPreauthTokens } from '@/lib/db/schema'

export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 5 * 60
export const TELEGRAM_PREAUTH_TTL_SECONDS = 5 * 60

function safeEqualHex(left: string, right: string) {
  try {
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
  } catch {
    return false
  }
}

export function verifyTelegramHash(data: Record<string, string>, now = Math.floor(Date.now() / 1000)): boolean {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false
  const { hash, ...rest } = data
  if (!hash) return false

  const authDate = Number.parseInt(rest.auth_date ?? '', 10)
  if (!Number.isFinite(authDate)) return false
  if (now - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS || authDate > now + 60) return false

  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  return safeEqualHex(hash, expected)
}

export function hashTelegramPreauthToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createTelegramPreauthToken(userId: string, now = new Date()) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashTelegramPreauthToken(token)
  const expiresAt = new Date(now.getTime() + TELEGRAM_PREAUTH_TTL_SECONDS * 1000)

  await db.insert(telegramPreauthTokens).values({ tokenHash, userId, expiresAt })
  return { token, expiresAt }
}

export async function consumeTelegramPreauthToken(userId: string, token: string, now = new Date()) {
  const tokenHash = hashTelegramPreauthToken(token)
  const [row] = await db
    .update(telegramPreauthTokens)
    .set({ usedAt: now })
    .where(and(
      eq(telegramPreauthTokens.tokenHash, tokenHash),
      eq(telegramPreauthTokens.userId, userId),
      isNull(telegramPreauthTokens.usedAt),
      gt(telegramPreauthTokens.expiresAt, now)
    ))
    .returning({ userId: telegramPreauthTokens.userId })

  return Boolean(row)
}

export async function cleanupTelegramPreauthTokens(now = new Date()) {
  await db
    .delete(telegramPreauthTokens)
    .where(lt(telegramPreauthTokens.expiresAt, now))
}

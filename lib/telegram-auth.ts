import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { telegramLoginFailures, telegramPreauthTokens } from '@/lib/db/schema'

export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 5 * 60
export const TELEGRAM_PREAUTH_TTL_SECONDS = 5 * 60

export type TelegramVerifyFailReason =
  | 'no_bot_token' | 'no_hash' | 'bad_auth_date' | 'stale' | 'future' | 'hmac_mismatch'

export interface TelegramVerifyResult {
  ok: boolean
  reason?: TelegramVerifyFailReason
  skewSeconds?: number   // now - authDate, когда auth_date распарсился
}

function safeEqualHex(left: string, right: string) {
  try {
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
  } catch {
    return false
  }
}

export function verifyTelegramHashWithReason(
  data: Record<string, string>,
  now = Math.floor(Date.now() / 1000),
): TelegramVerifyResult {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: 'no_bot_token' }
  const { hash, ...rest } = data
  if (!hash) return { ok: false, reason: 'no_hash' }
  const authDate = Number.parseInt(rest.auth_date ?? '', 10)
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'bad_auth_date' }
  const skewSeconds = now - authDate
  if (skewSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) return { ok: false, reason: 'stale', skewSeconds }
  if (authDate > now + 60) return { ok: false, reason: 'future', skewSeconds }
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (!safeEqualHex(hash, expected)) return { ok: false, reason: 'hmac_mismatch', skewSeconds }
  return { ok: true, skewSeconds }
}

export function verifyTelegramHash(data: Record<string, string>, now = Math.floor(Date.now() / 1000)): boolean {
  return verifyTelegramHashWithReason(data, now).ok
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

export async function consumeTelegramPreauthToken(token: string, now = new Date()): Promise<string | null> {
  const tokenHash = hashTelegramPreauthToken(token)
  const [row] = await db
    .update(telegramPreauthTokens)
    .set({ usedAt: now })
    .where(and(
      eq(telegramPreauthTokens.tokenHash, tokenHash),
      isNull(telegramPreauthTokens.usedAt),
      gt(telegramPreauthTokens.expiresAt, now)
    ))
    .returning({ userId: telegramPreauthTokens.userId })

  return row?.userId ?? null
}

export async function cleanupTelegramPreauthTokens(now = new Date()) {
  await db
    .delete(telegramPreauthTokens)
    .where(lt(telegramPreauthTokens.expiresAt, now))
}

export const TELEGRAM_LOGIN_FAILURE_RETENTION_DAYS = 30

export async function recordTelegramLoginFailure(input: {
  reason: string
  skewSeconds?: number
  tgId?: string | null
  tgUsername?: string | null
  hasHash: boolean
  ip?: string | null
}): Promise<void> {
  try {
    await db.insert(telegramLoginFailures).values({
      reason: input.reason,
      skewSeconds: input.skewSeconds ?? null,
      tgId: input.tgId ?? null,
      tgUsername: input.tgUsername ?? null,
      hasHash: input.hasHash,
      ip: input.ip ?? null,
    })
  } catch (error) {
    // best-effort: журнал не должен ломать auth-флоу
    console.error('[telegram-callback] failed to record login failure', { errorName: (error as Error)?.name })
  }
}

export async function cleanupTelegramLoginFailures(now = new Date()) {
  const cutoff = new Date(now.getTime() - TELEGRAM_LOGIN_FAILURE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await db.delete(telegramLoginFailures).where(lt(telegramLoginFailures.createdAt, cutoff))
}

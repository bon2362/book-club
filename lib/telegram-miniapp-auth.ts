import { createHmac, timingSafeEqual } from 'crypto'

export const TELEGRAM_MINI_APP_MAX_AGE_SECONDS = 5 * 60
const TELEGRAM_MINI_APP_MAX_FUTURE_SECONDS = 60

export type TelegramMiniAppAuthErrorCode = 'missing' | 'malformed' | 'expired' | 'invalid_signature'

export class TelegramMiniAppAuthError extends Error {
  constructor(public readonly code: TelegramMiniAppAuthErrorCode) {
    super(code)
  }
}

export type VerifiedTelegramMiniAppData = {
  telegramUserId: string
  username: string | null
  authDate: Date
}

type TelegramMiniAppUser = {
  id?: unknown
  username?: unknown
}

function parseAuthDate(value: string | null): Date {
  if (!value || !/^\d+$/.test(value)) throw new TelegramMiniAppAuthError('malformed')
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds)) throw new TelegramMiniAppAuthError('malformed')
  return new Date(seconds * 1000)
}

function parseUser(value: string | null): { telegramUserId: string; username: string | null } {
  if (!value) throw new TelegramMiniAppAuthError('malformed')
  let user: TelegramMiniAppUser
  try {
    user = JSON.parse(value) as TelegramMiniAppUser
  } catch {
    throw new TelegramMiniAppAuthError('malformed')
  }
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new TelegramMiniAppAuthError('malformed')
  }
  return {
    telegramUserId: String(user.id),
    username: typeof user.username === 'string' && user.username.trim() ? user.username.trim() : null,
  }
}

function verifySignature(params: URLSearchParams, hash: string, token: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(hash)) return false
  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest()
  const received = Buffer.from(hash, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function verifyTelegramMiniAppInitData(
  raw: string,
  now = new Date(),
): Promise<VerifiedTelegramMiniAppData> {
  if (!raw?.trim()) throw new TelegramMiniAppAuthError('missing')
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new TelegramMiniAppAuthError('missing')

  const params = new URLSearchParams(raw)
  const hashes = params.getAll('hash')
  if (hashes.length === 0 || !hashes[0]) throw new TelegramMiniAppAuthError('missing')
  if (hashes.length !== 1 || !verifySignature(params, hashes[0], token)) {
    throw new TelegramMiniAppAuthError('invalid_signature')
  }

  const authDate = parseAuthDate(params.get('auth_date'))
  const ageSeconds = Math.floor((now.getTime() - authDate.getTime()) / 1000)
  if (ageSeconds > TELEGRAM_MINI_APP_MAX_AGE_SECONDS || ageSeconds < -TELEGRAM_MINI_APP_MAX_FUTURE_SECONDS) {
    throw new TelegramMiniAppAuthError('expired')
  }

  return { ...parseUser(params.get('user')), authDate }
}

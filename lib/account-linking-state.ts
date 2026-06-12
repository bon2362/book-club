import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const TELEGRAM_ACCOUNT_LINK_STATE_TTL_SECONDS = 5 * 60
const TELEGRAM_ACCOUNT_LINK_PURPOSE = 'telegram-account-link'

interface AccountLinkStatePayload {
  purpose: typeof TELEGRAM_ACCOUNT_LINK_PURPOSE
  userId: string
  issuedAt: number
  expiresAt: number
  nonce: string
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function signingSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createTelegramAccountLinkState(userId: string, now = new Date()): string {
  const secret = signingSecret()
  if (!secret) throw new Error('Missing auth secret for account linking state')

  const issuedAt = Math.floor(now.getTime() / 1000)
  const payload: AccountLinkStatePayload = {
    purpose: TELEGRAM_ACCOUNT_LINK_PURPOSE,
    userId,
    issuedAt,
    expiresAt: issuedAt + TELEGRAM_ACCOUNT_LINK_STATE_TTL_SECONDS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const encoded = base64url(JSON.stringify(payload))
  return `${encoded}.${signPayload(encoded, secret)}`
}

export function verifyTelegramAccountLinkState(
  state: string | null | undefined,
  expectedUserId: string,
  now = new Date()
): boolean {
  const secret = signingSecret()
  if (!secret || !state) return false

  const [encoded, signature] = state.split('.')
  if (!encoded || !signature) return false

  const expectedSignature = signPayload(encoded, secret)
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return false
  } catch {
    return false
  }

  let payload: AccountLinkStatePayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AccountLinkStatePayload
  } catch {
    return false
  }

  const nowSeconds = Math.floor(now.getTime() / 1000)
  return payload.purpose === TELEGRAM_ACCOUNT_LINK_PURPOSE &&
    payload.userId === expectedUserId &&
    Number.isFinite(payload.expiresAt) &&
    payload.expiresAt >= nowSeconds
}

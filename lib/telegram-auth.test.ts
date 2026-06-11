/**
 * @jest-environment node
 *
 * Tests for verifyTelegramHashWithReason (lib/telegram-auth.ts).
 * Проверяет каждую причину отказа и успешный путь.
 */
import { createHash, createHmac } from 'crypto'

// telegram-auth.ts тянет lib/db → @/env (ESM @t3-oss/env-nextjs, который Jest не
// трансформирует). verifyTelegramHashWithReason сам БД не использует — мокаем db,
// чтобы цепочка импортов не грузила env (как в callback/route.test.ts).
jest.mock('@/lib/db', () => ({ db: {} }))

import { verifyTelegramHashWithReason, TELEGRAM_AUTH_MAX_AGE_SECONDS } from './telegram-auth'

const BOT_TOKEN = 'test-bot-token-for-reason-tests'

function computeHash(data: Record<string, string>, token: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _omit, ...rest } = data
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(token).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

const NOW = Math.floor(Date.now() / 1000)

const baseData = {
  id: '111222333',
  first_name: 'Test',
  auth_date: String(NOW),
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
})

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN
})

describe('verifyTelegramHashWithReason', () => {
  it('ok: true для корректного payload', () => {
    const hash = computeHash(baseData, BOT_TOKEN)
    const result = verifyTelegramHashWithReason({ ...baseData, hash }, NOW)
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.skewSeconds).toBeDefined()
    expect(result.skewSeconds).toBeGreaterThanOrEqual(0)
  })

  it('no_bot_token: нет TELEGRAM_BOT_TOKEN в env', () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const hash = computeHash(baseData, BOT_TOKEN)
    const result = verifyTelegramHashWithReason({ ...baseData, hash }, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no_bot_token')
  })

  it('no_hash: отсутствует поле hash', () => {
    const result = verifyTelegramHashWithReason({ ...baseData }, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no_hash')
  })

  it('bad_auth_date: auth_date не является числом', () => {
    const data = { ...baseData, auth_date: 'not-a-number', hash: 'aabbcc' }
    const result = verifyTelegramHashWithReason(data, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bad_auth_date')
  })

  it('stale: auth_date слишком старый (skewSeconds > MAX_AGE)', () => {
    const staleDate = NOW - TELEGRAM_AUTH_MAX_AGE_SECONDS - 10
    const staleData = { ...baseData, auth_date: String(staleDate) }
    const hash = computeHash(staleData, BOT_TOKEN)
    const result = verifyTelegramHashWithReason({ ...staleData, hash }, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('stale')
    expect(result.skewSeconds).toBeGreaterThan(TELEGRAM_AUTH_MAX_AGE_SECONDS)
  })

  it('future: auth_date в будущем (> now + 60)', () => {
    const futureDate = NOW + 120
    const futureData = { ...baseData, auth_date: String(futureDate) }
    const hash = computeHash(futureData, BOT_TOKEN)
    const result = verifyTelegramHashWithReason({ ...futureData, hash }, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('future')
  })

  it('hmac_mismatch: неверный hash при правильных остальных полях', () => {
    const hash = 'a'.repeat(64) // валидный hex, но неверное значение
    const result = verifyTelegramHashWithReason({ ...baseData, hash }, NOW)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('hmac_mismatch')
    expect(result.skewSeconds).toBeDefined()
  })
})

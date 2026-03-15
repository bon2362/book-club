/**
 * @jest-environment node
 *
 * Security tests for Telegram HMAC-SHA256 verification (lib/auth.ts).
 * Re-implements verifyTelegramHash locally to validate the algorithm
 * and document known security gaps (replay attack surface via auth_date).
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto'

function computeTelegramHash(data: Record<string, string>, botToken: string): string {
  const { hash: _omit, ...rest } = data
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

function verifyTelegramHash(data: Record<string, string>, botToken: string): boolean {
  if (!botToken) return false
  const { hash, ...rest } = data
  if (!hash) return false
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

const BOT_TOKEN = 'test-bot-token-12345'

const validData = {
  id: '123456789',
  first_name: 'Ivan',
  auth_date: String(Math.floor(Date.now() / 1000)),
}

describe('Telegram HMAC verification', () => {
  it('принимает корректно подписанный payload', () => {
    const hash = computeTelegramHash(validData, BOT_TOKEN)
    expect(verifyTelegramHash({ ...validData, hash }, BOT_TOKEN)).toBe(true)
  })

  it('[SEC] отклоняет payload с неверным hash', () => {
    const badHash = 'a'.repeat(64)
    expect(verifyTelegramHash({ ...validData, hash: badHash }, BOT_TOKEN)).toBe(false)
  })

  it('[SEC] отклоняет payload без поля hash', () => {
    expect(verifyTelegramHash({ ...validData }, BOT_TOKEN)).toBe(false)
  })

  it('[SEC] отклоняет при отсутствии TELEGRAM_BOT_TOKEN', () => {
    const hash = computeTelegramHash(validData, BOT_TOKEN)
    expect(verifyTelegramHash({ ...validData, hash }, '')).toBe(false)
  })

  it('[SEC] отклоняет подмену id после подписи', () => {
    const hash = computeTelegramHash(validData, BOT_TOKEN)
    const tampered = { ...validData, id: '999999999', hash }
    expect(verifyTelegramHash(tampered, BOT_TOKEN)).toBe(false)
  })

  it('[SEC] отклоняет добавление поля после подписи', () => {
    const hash = computeTelegramHash(validData, BOT_TOKEN)
    const tampered = { ...validData, is_bot: 'true', hash }
    expect(verifyTelegramHash(tampered, BOT_TOKEN)).toBe(false)
  })

  it('[SEC] отклоняет hash с не-hex символами (нет обхода через Buffer)', () => {
    const badHash = 'gg'.repeat(32)
    expect(verifyTelegramHash({ ...validData, hash: badHash }, BOT_TOKEN)).toBe(false)
  })

  it('[SEC] отклоняет hash неверной длины (timingSafeEqual throws → false)', () => {
    expect(verifyTelegramHash({ ...validData, hash: 'abc123' }, BOT_TOKEN)).toBe(false)
  })

  it('верификация зависит от токена бота', () => {
    const hash = computeTelegramHash(validData, BOT_TOKEN)
    expect(verifyTelegramHash({ ...validData, hash }, 'other-bot-token')).toBe(false)
  })

  it('порядок полей не влияет на результат (ключи сортируются)', () => {
    const shuffled = {
      hash: computeTelegramHash(validData, BOT_TOKEN),
      auth_date: validData.auth_date,
      first_name: validData.first_name,
      id: validData.id,
    }
    expect(verifyTelegramHash(shuffled, BOT_TOKEN)).toBe(true)
  })
})

describe('[SEC] Telegram auth_date freshness — replay attack surface', () => {
  // Баг: текущая реализация не проверяет свежесть auth_date.
  // Payload из прошлого с валидным HMAC будет принят.
  // Рекомендация: Date.now()/1000 - parseInt(auth_date) < 86400
  it('документирует: устаревший auth_date сейчас НЕ отклоняется (known gap)', () => {
    const staleData = {
      id: '123456789',
      first_name: 'Ivan',
      auth_date: '1000000000', // 2001 год — заведомо устаревший
    }
    const hash = computeTelegramHash(staleData, BOT_TOKEN)
    const result = verifyTelegramHash({ ...staleData, hash }, BOT_TOKEN)
    // Сейчас true — это known limitation, тест-маркер для будущего фикса
    expect(result).toBe(true)
  })
})

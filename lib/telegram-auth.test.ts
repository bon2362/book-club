/**
 * @jest-environment node
 *
 * Tests for verifyTelegramHashWithReason (lib/telegram-auth.ts).
 * Проверяет каждую причину отказа и успешный путь.
 */
import { createHash, createHmac } from 'crypto'

// telegram-auth.ts тянет lib/db → @/env (ESM @t3-oss/env-nextjs, который Jest не
// трансформирует). Мокаем db со шпионами insert/delete, чтобы:
// 1) цепочка импортов не грузила env
// 2) можно было проверить вызовы recordTelegramLoginFailure / cleanupTelegramLoginFailures
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}))

import { db } from '@/lib/db'
import {
  verifyTelegramHashWithReason,
  recordTelegramLoginFailure,
  cleanupTelegramLoginFailures,
  createTelegramPreauthToken,
  consumeTelegramPreauthToken,
  TELEGRAM_AUTH_MAX_AGE_SECONDS,
} from './telegram-auth'

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

describe('recordTelegramLoginFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('вызывает db.insert с замапленными полями', async () => {
    const valuesMock = jest.fn().mockResolvedValue(undefined)
    ;(db.insert as jest.Mock).mockReturnValue({ values: valuesMock })

    await recordTelegramLoginFailure({
      reason: 'stale',
      skewSeconds: 400,
      tgId: '123',
      tgUsername: 'testuser',
      hasHash: true,
      ip: '1.2.3.4',
    })

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'stale',
      skewSeconds: 400,
      tgId: '123',
      tgUsername: 'testuser',
      hasHash: true,
      ip: '1.2.3.4',
    }))
  })

  it('best-effort: при выбросе из insert НЕ реджектит промис', async () => {
    const valuesMock = jest.fn().mockRejectedValue(new Error('DB down'))
    ;(db.insert as jest.Mock).mockReturnValue({ values: valuesMock })

    await expect(recordTelegramLoginFailure({
      reason: 'hmac_mismatch',
      hasHash: false,
    })).resolves.toBeUndefined()
  })
})

describe('cleanupTelegramLoginFailures', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('вызывает db.delete для записей старше 30 дней', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where: whereMock })

    const now = new Date('2026-06-14T00:00:00Z')
    await cleanupTelegramLoginFailures(now)

    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(whereMock).toHaveBeenCalledTimes(1)
  })
})

describe('createTelegramPreauthToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('вызывает db.insert с tokenHash, userId, expiresAt', async () => {
    const valuesMock = jest.fn().mockResolvedValue(undefined)
    ;(db.insert as jest.Mock).mockReturnValue({ values: valuesMock })

    const result = await createTelegramPreauthToken('test-user-id')

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'test-user-id',
      tokenHash: expect.any(String),
      expiresAt: expect.any(Date),
    }))
    expect(result.token).toBeDefined()
    expect(typeof result.token).toBe('string')
    expect(result.token.length).toBeGreaterThan(0)
  })
})

describe('consumeTelegramPreauthToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает userId при успешном consume', async () => {
    const returningMock = jest.fn().mockResolvedValue([{ userId: 'resolved-user-id' }])
    const whereMock = jest.fn().mockReturnValue({ returning: returningMock })
    const setMock = jest.fn().mockReturnValue({ where: whereMock })
    ;(db.update as jest.Mock).mockReturnValue({ set: setMock })

    const result = await consumeTelegramPreauthToken('some-token')

    expect(db.update).toHaveBeenCalledTimes(1)
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ usedAt: expect.any(Date) }))
    expect(result).toBe('resolved-user-id')
  })

  it('возвращает null если токен не найден', async () => {
    const returningMock = jest.fn().mockResolvedValue([])
    const whereMock = jest.fn().mockReturnValue({ returning: returningMock })
    const setMock = jest.fn().mockReturnValue({ where: whereMock })
    ;(db.update as jest.Mock).mockReturnValue({ set: setMock })

    const result = await consumeTelegramPreauthToken('nonexistent-token')

    expect(result).toBeNull()
  })
})

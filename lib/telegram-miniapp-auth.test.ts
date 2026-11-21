/** @jest-environment node */

import { createHmac } from 'crypto'
import { verifyTelegramMiniAppInitData } from './telegram-miniapp-auth'

const BOT_TOKEN = 'test-mini-app-bot-token'
const NOW = new Date('2026-11-21T12:00:00.000Z')

function sign(params: Record<string, string>) {
  const dataCheckString = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

function payload(overrides: Record<string, string> = {}) {
  return sign({
    auth_date: String(Math.floor(NOW.getTime() / 1000)),
    query_id: 'AAH-test-query',
    user: JSON.stringify({ id: 900100200, first_name: 'Тест', username: 'reader' }),
    ...overrides,
  })
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
})

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN
})

describe('verifyTelegramMiniAppInitData', () => {
  it('accepts correctly signed Mini App init data', async () => {
    await expect(verifyTelegramMiniAppInitData(payload(), NOW)).resolves.toEqual({
      telegramUserId: '900100200',
      username: 'reader',
      authDate: NOW,
    })
  })

  it('rejects init data without hash', async () => {
    const raw = new URLSearchParams(payload())
    raw.delete('hash')

    await expect(verifyTelegramMiniAppInitData(raw.toString(), NOW))
      .rejects.toMatchObject({ code: 'missing' })
  })

  it('rejects data when user is changed after signing', async () => {
    const raw = new URLSearchParams(payload())
    raw.set('user', JSON.stringify({ id: 42, first_name: 'Злоумышленник' }))

    await expect(verifyTelegramMiniAppInitData(raw.toString(), NOW))
      .rejects.toMatchObject({ code: 'invalid_signature' })
  })

  it('rejects stale init data', async () => {
    const stale = new Date(NOW.getTime() - 5 * 60 * 1000 - 1)
    const raw = payload({ auth_date: String(Math.floor(stale.getTime() / 1000)) })

    await expect(verifyTelegramMiniAppInitData(raw, NOW))
      .rejects.toMatchObject({ code: 'expired' })
  })

  it('rejects auth dates more than one minute in the future', async () => {
    const future = new Date(NOW.getTime() + 61 * 1000)
    const raw = payload({ auth_date: String(Math.floor(future.getTime() / 1000)) })

    await expect(verifyTelegramMiniAppInitData(raw, NOW))
      .rejects.toMatchObject({ code: 'expired' })
  })
})

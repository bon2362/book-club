/**
 * @jest-environment node
 *
 * Unit-тесты для GET /api/auth/telegram/callback — route handler.
 * Проверяет: создание/поиск пользователя через identity helper, генерацию pre-auth токена,
 * redirect на /auth/telegram, отклонение невалидного HMAC.
 */
import { NextRequest } from 'next/server'
import { createHash, createHmac } from 'crypto'
import { GET } from './route'

jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

const BOT_TOKEN = 'test-telegram-bot-token'
const SECRET = 'test-auth-secret-that-is-long-enough-32'

/** Вычисляет корректный Telegram HMAC для набора параметров */
function signTelegramParams(params: Record<string, string>): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _omit, ...rest } = params
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(BOT_TOKEN).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/telegram/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

function validParams(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {
    id: '123456789',
    first_name: 'Иван',
    last_name: 'Петров',
    username: 'ivanp',
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  }
  base.hash = signTelegramParams(base)
  return base
}

describe('GET /api/auth/telegram/callback', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
    process.env.NEXTAUTH_SECRET = SECRET
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'canonical-uuid',
      email: 'telegram:123456789@telegram.user',
      name: 'Иван Петров',
      telegramUsername: 'ivanp',
    })
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.NEXTAUTH_SECRET
  })

  it('создаёт пользователя через identity helper и редиректит на /auth/telegram при валидном HMAC', async () => {
    const { db } = await import('@/lib/db')
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    const url = new URL(location)
    expect(url.pathname).toBe('/auth/telegram')
    expect(url.searchParams.has('uid')).toBe(false)
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(url.searchParams.get('ts')).toBeTruthy()
    expect(url.searchParams.has('username')).toBe(false)
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('telegram', '123456789', expect.objectContaining({
      name: 'Иван Петров',
      image: null,
      telegramUsername: 'ivanp',
      metadata: { source: 'telegram-callback' },
    }))
    expect(db.insert).toHaveBeenCalled()
  })

  it('[SEC] редиректит на /?auth=failed при невалидном hash', async () => {
    const { db } = await import('@/lib/db')
    const params = validParams()
    params.hash = 'a'.repeat(64) // подмена
    const res = await GET(makeRequest(params))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')
    expect(db.insert).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('[SEC] редиректит на /?auth=failed если auth_date старше 5 минут', async () => {
    const { db } = await import('@/lib/db')
    const params = validParams({ auth_date: String(Math.floor(Date.now() / 1000) - 600) })
    const res = await GET(makeRequest(params))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')
    expect(db.insert).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('[SEC] редиректит на /?auth=failed при отсутствии TELEGRAM_BOT_TOKEN', async () => {
    const { db } = await import('@/lib/db')
    delete process.env.TELEGRAM_BOT_TOKEN
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')
    expect(db.insert).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('не добавляет username в redirect URL', async () => {
    const base: Record<string, string> = {
      id: '999',
      first_name: 'Аня',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    base.hash = signTelegramParams(base)
    const res = await GET(makeRequest(base))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.has('username')).toBe(false)
  })

  it('использует first_name + last_name как имя пользователя в identity profile', async () => {
    await GET(makeRequest(validParams()))

    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('telegram', '123456789', expect.objectContaining({
      name: 'Иван Петров',
    }))
  })

  it('повторный вход делегирует идемпотентность identity helper', async () => {
    await GET(makeRequest(validParams()))
    await GET(makeRequest(validParams()))

    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledTimes(2)
  })
})

/**
 * @jest-environment node
 *
 * Unit-тесты для GET /api/auth/telegram/callback — route handler.
 * Проверяет: создание пользователя в БД, генерацию pre-auth токена,
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
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.NEXTAUTH_SECRET
  })

  it('создаёт пользователя в БД и редиректит на /auth/telegram при валидном HMAC', async () => {
    const { db } = await import('@/lib/db')
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    const url = new URL(location)
    expect(url.pathname).toBe('/auth/telegram')
    expect(url.searchParams.get('uid')).toBe('telegram:123456789')
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(url.searchParams.get('ts')).toBeTruthy()
    expect(url.searchParams.get('username')).toBe('ivanp')
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
  })

  it('[SEC] редиректит на /?auth=failed при отсутствии TELEGRAM_BOT_TOKEN', async () => {
    const { db } = await import('@/lib/db')
    delete process.env.TELEGRAM_BOT_TOKEN
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('не добавляет username в redirect URL если он отсутствует', async () => {
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

  it('использует first_name + last_name как имя пользователя в БД', async () => {
    const { db } = await import('@/lib/db')
    const mockValues = jest.fn().mockReturnValue({ onConflictDoUpdate: jest.fn().mockResolvedValue(undefined) })
    ;(db.insert as jest.Mock).mockReturnValue({ values: mockValues })

    await GET(makeRequest(validParams()))

    const insertArg = mockValues.mock.calls[0][0]
    expect(insertArg.name).toBe('Иван Петров')
    expect(insertArg.email).toBe('telegram:123456789@telegram.user')
  })

  it('повторный вход вызывает onConflictDoUpdate (не дублирует пользователя)', async () => {
    const { db } = await import('@/lib/db')
    const mockOnConflict = jest.fn().mockResolvedValue(undefined)
    const mockValues = jest.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict })
    ;(db.insert as jest.Mock).mockReturnValue({ values: mockValues })

    await GET(makeRequest(validParams()))
    await GET(makeRequest(validParams()))

    expect(mockOnConflict).toHaveBeenCalledTimes(2)
  })
})

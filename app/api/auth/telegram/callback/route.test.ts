/**
 * @jest-environment node
 *
 * Unit-тесты для GET /api/auth/telegram/callback — новый серверный флоу.
 * Успех → кука сессии + redirect 307 на /
 * Провал HMAC / стухший auth_date / нет bot token → redirect /?auth=failed + recordTelegramLoginFailure, без куки.
 */
import { NextRequest } from 'next/server'
import { createHash, createHmac } from 'crypto'
import { GET } from './route'

jest.mock('@auth/core/jwt', () => ({
  encode: jest.fn().mockResolvedValue('mocked-session-token'),
}))

jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { db } from '@/lib/db'

const BOT_TOKEN = 'test-telegram-bot-token'
const SECRET = 'test-auth-secret-that-is-long-enough-32'

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
      contactEmail: null,
      name: 'Иван Петров',
    })
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.NEXTAUTH_SECRET
  })

  it('при валидном HMAC ставит куку сессии и редиректит на /', async () => {
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    const url = new URL(location)
    expect(url.pathname).toBe('/')
    expect(url.searchParams.has('token')).toBe(false)
    expect(url.searchParams.has('auth')).toBe(false)

    // кука сессии выдана (http → authjs.session-token)
    const cookieHeader = res.headers.get('set-cookie') ?? ''
    expect(cookieHeader).toContain('authjs.session-token')
  })

  it('при валидном HMAC вызывает resolveOrCreateUserFromIdentity', async () => {
    await GET(makeRequest(validParams()))

    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('telegram', '123456789', expect.objectContaining({
      name: 'Иван Петров',
      image: null,
      telegramUsername: 'ivanp',
      metadata: { source: 'telegram-callback' },
    }))
  })

  it('НЕ редиректит на /auth/telegram и не передаёт ?token=', async () => {
    const res = await GET(makeRequest(validParams()))

    const location = res.headers.get('location')!
    expect(location).not.toContain('/auth/telegram')
    expect(location).not.toContain('token=')
  })

  it('[SEC] при невалидном hash редиректит на /?auth=failed, кука не ставится', async () => {
    const params = validParams()
    params.hash = 'a'.repeat(64)
    const res = await GET(makeRequest(params))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')

    const cookieHeader = res.headers.get('set-cookie') ?? ''
    expect(cookieHeader).not.toContain('authjs.session-token')
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()

    // recordTelegramLoginFailure вызвана через db.insert
    expect(db.insert).toHaveBeenCalled()
  })

  it('[SEC] при протухшем auth_date редиректит на /?auth=failed, кука не ставится', async () => {
    const params = validParams({ auth_date: String(Math.floor(Date.now() / 1000) - 600) })
    const res = await GET(makeRequest(params))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')

    const cookieHeader = res.headers.get('set-cookie') ?? ''
    expect(cookieHeader).not.toContain('authjs.session-token')
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(db.insert).toHaveBeenCalled()
  })

  it('[SEC] при отсутствии TELEGRAM_BOT_TOKEN редиректит на /?auth=failed', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')

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

    const location = res.headers.get('location')!
    expect(location).not.toContain('username')
  })

  it('при ошибке resolveOrCreateUserFromIdentity редиректит на /?auth=failed', async () => {
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')
  })
})

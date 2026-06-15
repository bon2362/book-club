/**
 * @jest-environment node
 *
 * Unit-тесты для POST /api/telegram/webhook
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

jest.mock('@/lib/telegram-auth', () => ({
  createTelegramPreauthToken: jest.fn(),
}))

jest.mock('@/lib/telegram-bot', () => ({
  sendTelegramMessage: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  db: {},
}))

import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { createTelegramPreauthToken } from '@/lib/telegram-auth'
import { sendTelegramMessage } from '@/lib/telegram-bot'
import { POST } from './route'

const SECRET = 'test-webhook-secret'

function makeRequest(body: unknown, secretHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': secretHeader ?? SECRET,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/telegram/webhook', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    jest.clearAllMocks()
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({ id: 'user-uuid' })
    ;(createTelegramPreauthToken as jest.Mock).mockResolvedValue({ token: 'tok123', expiresAt: new Date() })
    ;(sendTelegramMessage as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    delete process.env.NEXTAUTH_URL
  })

  it('нет секрета в заголовке → 401, без вызовов', async () => {
    const req = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: '/start', from: { id: 1 } } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(createTelegramPreauthToken).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('неверный секрет → 401, без вызовов', async () => {
    const req = makeRequest({ message: { text: '/start', from: { id: 1 } } }, 'wrong-secret')
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('верный секрет + /start → resolveOrCreateUser + createToken + sendMessage вызваны, 200', async () => {
    const update = {
      message: {
        text: '/start login',
        from: { id: 42, first_name: 'Иван', last_name: 'Петров', username: 'ivanp' },
      },
    }
    const res = await POST(makeRequest(update))
    expect(res.status).toBe(200)

    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith(
      'telegram',
      '42',
      expect.objectContaining({
        name: 'Иван Петров',
        telegramUsername: 'ivanp',
        metadata: { source: 'telegram-bot' },
      }),
    )
    expect(createTelegramPreauthToken).toHaveBeenCalledWith('user-uuid')
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      42,
      expect.any(String),
      'http://localhost:3000/api/auth/telegram/login?token=tok123',
    )
  })

  it('верный секрет, текст не /start → 200 без действий', async () => {
    const update = {
      message: {
        text: 'hello',
        from: { id: 42, first_name: 'Иван' },
      },
    }
    const res = await POST(makeRequest(update))
    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(createTelegramPreauthToken).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })
})

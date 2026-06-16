/**
 * @jest-environment node
 *
 * Unit-тесты для POST /api/telegram/webhook (поллинг-схема: привязка nonce)
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

jest.mock('@/lib/telegram-auth', () => ({
  bindTelegramLoginNonce: jest.fn(),
}))

jest.mock('@/lib/telegram-bot', () => ({
  sendTelegramMessage: jest.fn(),
}))

jest.mock('@/lib/db', () => ({ db: {} }))

import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { bindTelegramLoginNonce } from '@/lib/telegram-auth'
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
    jest.clearAllMocks()
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({ id: 'user-uuid' })
    ;(bindTelegramLoginNonce as jest.Mock).mockResolvedValue(undefined)
    ;(sendTelegramMessage as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
  })

  it('нет секрета в заголовке → 401, без вызовов', async () => {
    const req = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: '/start n', from: { id: 1 } } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('неверный секрет → 401', async () => {
    const res = await POST(makeRequest({ message: { text: '/start n', from: { id: 1 } } }, 'wrong'))
    expect(res.status).toBe(401)
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
  })

  it('верный секрет + /start <nonce> → resolveOrCreateUser + bindNonce + sendMessage, 200', async () => {
    const update = {
      message: {
        text: '/start abc-nonce-123',
        from: { id: 42, first_name: 'Иван', last_name: 'Петров', username: 'ivanp' },
      },
    }
    const res = await POST(makeRequest(update))
    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith(
      'telegram', '42',
      expect.objectContaining({ name: 'Иван Петров', telegramUsername: 'ivanp', metadata: { source: 'telegram-bot' } }),
    )
    expect(bindTelegramLoginNonce).toHaveBeenCalledWith('abc-nonce-123', 'user-uuid')
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('Готово'))
  })

  it('голый /start без nonce → инструкция, без привязки', async () => {
    const update = { message: { text: '/start', from: { id: 42, first_name: 'Иван' } } }
    const res = await POST(makeRequest(update))
    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('slowreading.club'))
  })

  it('текст не /start → 200 без действий', async () => {
    const res = await POST(makeRequest({ message: { text: 'hello', from: { id: 42 } } }))
    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })
})

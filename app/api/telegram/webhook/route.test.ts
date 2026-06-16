/**
 * @jest-environment node
 *
 * Unit-тесты для POST /api/telegram/webhook (вход через nonce + привязка через link_<nonce>)
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/user-identities', () => {
  class IdentityConflictError extends Error {}
  return {
    resolveOrCreateUserFromIdentity: jest.fn(),
    linkVerifiedIdentityToUser: jest.fn(),
    IdentityConflictError,
  }
})

jest.mock('@/lib/telegram-auth', () => ({
  bindTelegramLoginNonce: jest.fn(),
  consumeTelegramPreauthToken: jest.fn(),
}))

jest.mock('@/lib/telegram-bot', () => ({
  sendTelegramMessage: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}))

jest.mock('@/lib/db', () => ({ db: {} }))

import { resolveOrCreateUserFromIdentity, linkVerifiedIdentityToUser, IdentityConflictError } from '@/lib/user-identities'
import { bindTelegramLoginNonce, consumeTelegramPreauthToken } from '@/lib/telegram-auth'
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
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue('target-uuid')
    ;(linkVerifiedIdentityToUser as jest.Mock).mockResolvedValue({ id: 'target-uuid' })
    ;(sendTelegramMessage as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => { delete process.env.TELEGRAM_WEBHOOK_SECRET })

  it('неверный секрет → 401, без действий', async () => {
    const res = await POST(makeRequest({ message: { text: '/start n', from: { id: 1 } } }, 'wrong'))
    expect(res.status).toBe(401)
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  // ── вход ──
  it('/start <nonce> → bindLoginNonce + сообщение входа', async () => {
    const res = await POST(makeRequest({ message: { text: '/start abc-123', from: { id: 42, first_name: 'Иван', username: 'ivanp' } } }))
    expect(res.status).toBe(200)
    expect(bindTelegramLoginNonce).toHaveBeenCalledWith('abc-123', 'user-uuid')
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('Готово'))
  })

  it('голый /start → инструкция', async () => {
    await POST(makeRequest({ message: { text: '/start', from: { id: 42 } } }))
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('slowreading.club'))
  })

  // ── привязка ──
  it('/start link_<nonce> валидный → linkVerifiedIdentityToUser + успех', async () => {
    const res = await POST(makeRequest({ message: { text: '/start link_n1', from: { id: 42, first_name: 'Иван', username: 'ivanp' } } }))
    expect(res.status).toBe(200)
    expect(consumeTelegramPreauthToken).toHaveBeenCalledWith('n1')
    expect(linkVerifiedIdentityToUser).toHaveBeenCalledWith('target-uuid', 'telegram', '42', expect.objectContaining({ telegramUsername: 'ivanp' }), expect.anything())
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('привязан'))
  })

  it('/start link_<nonce> устаревший (consume→null) → не привязывает', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)
    await POST(makeRequest({ message: { text: '/start link_old', from: { id: 42 } } }))
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('устарел'))
  })

  it('/start link_<nonce> конфликт → сообщение о конфликте', async () => {
    ;(linkVerifiedIdentityToUser as jest.Mock).mockRejectedValue(new IdentityConflictError('conflict'))
    await POST(makeRequest({ message: { text: '/start link_n2', from: { id: 42 } } }))
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('уже привязан'))
  })
})

/**
 * @jest-environment node
 */

import { createHash, createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ auditTx: true }),
}))

jest.mock('@/lib/telegram-auth', () => ({
  verifyTelegramHashWithReason: jest.fn(),
}))

jest.mock('@/lib/account-linking-state', () => ({
  verifyTelegramAccountLinkState: jest.fn(),
}))

jest.mock('@/lib/user-identities', () => ({
  IdentityConflictError: class IdentityConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'IdentityConflictError'
    }
  },
  linkVerifiedIdentityToUser: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { verifyTelegramHashWithReason } from '@/lib/telegram-auth'
import { verifyTelegramAccountLinkState } from '@/lib/account-linking-state'
import { IdentityConflictError, linkVerifiedIdentityToUser } from '@/lib/user-identities'

const BOT_TOKEN = 'test-telegram-bot-token'

function signTelegramParams(params: Record<string, string>): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _omit, ...rest } = params
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(BOT_TOKEN).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
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

function makeRequest(params: Record<string, string>, state = 'signed-state'): NextRequest {
  const url = new URL('http://localhost/api/account/identities/telegram/callback')
  if (state) url.searchParams.set('state', state)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new NextRequest(url.toString())
}

function redirectStatus(res: Response): string | null {
  const location = res.headers.get('location')
  return location ? new URL(location).searchParams.get('account_link') : null
}

describe('GET /api/account/identities/telegram/callback', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
    jest.clearAllMocks()
    ;(verifyTelegramHashWithReason as jest.Mock).mockReturnValue({ ok: true, skewSeconds: 0 })
    ;(verifyTelegramAccountLinkState as jest.Mock).mockReturnValue(true)
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('редиректит без сессии и не линкует identity', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('telegram_unauthorized')
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('редиректит если state не принадлежит текущей сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(verifyTelegramAccountLinkState as jest.Mock).mockReturnValue(false)

    const res = await GET(makeRequest(validParams(), 'other-user-state'))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('telegram_state_failed')
    expect(verifyTelegramAccountLinkState).toHaveBeenCalledWith('other-user-state', 'user-1')
    expect(verifyTelegramHashWithReason).not.toHaveBeenCalled()
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('редиректит при невалидном Telegram hash', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    const params = validParams()
    params.hash = 'a'.repeat(64)
    ;(verifyTelegramHashWithReason as jest.Mock).mockReturnValue({ ok: false, reason: 'hmac_mismatch', skewSeconds: 0 })

    const res = await GET(makeRequest(params))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('telegram_failed')
    expect(verifyTelegramHashWithReason).toHaveBeenCalledWith(expect.not.objectContaining({
      state: expect.any(String),
    }))
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('редиректит conflict если Telegram identity уже у другого user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(linkVerifiedIdentityToUser as jest.Mock).mockRejectedValueOnce(
      new IdentityConflictError('Identity telegram:123456789 is already linked to another user')
    )

    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('telegram_conflict')
  })

  it('линкует verified Telegram identity к текущему user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })

    const res = await GET(makeRequest(validParams()))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('telegram_ok')
    expect(linkVerifiedIdentityToUser).toHaveBeenCalledWith('user-1', 'telegram', '123456789', expect.objectContaining({
      name: 'Иван Петров',
      image: null,
      telegramUsername: 'ivanp',
      metadata: { source: 'account-linking-telegram' },
      now: expect.any(Date),
    }), expect.objectContaining({ auditTx: true }))
  })
})

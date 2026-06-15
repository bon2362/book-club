/**
 * @jest-environment node
 *
 * Tests for lib/auth.ts:
 * - jwt callback (isAdmin, provider, deleted user)
 * - session callback (user.id, isAdmin, provider)
 * - telegram-preauth provider authorize (one-time token consume, freshness, DB lookup)
 * - signIn identity sync error handling
 */

// ── Mocks (must be before imports) ───────────────────────────────────────────

jest.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: jest.fn(() => ({})),
}))

jest.mock('@/lib/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}))

jest.mock('@/lib/auth.google-one-tap', () => ({
  authorizeGoogleOneTap: jest.fn(),
}))

jest.mock('@/lib/telegram-auth', () => ({
  consumeTelegramPreauthToken: jest.fn(),
  recordTelegramLoginFailure: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/user-activity', () => ({
  bestEffortRecordUserActivity: jest.fn(),
}))

jest.mock('@/lib/user-identities', () => ({
  IdentityConflictError: class IdentityConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'IdentityConflictError'
    }
  },
  linkIdentityToUser: jest.fn(),
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', type: 'oauth' })),
}))

jest.mock('next-auth/providers/resend', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'resend', type: 'email' })),
}))

// Credentials: pass-through so authorize() is preserved in the returned object
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((config: Record<string, unknown>) => ({ type: 'credentials', ...config })),
}))

jest.mock('resend', () => ({
  Resend: jest.fn(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-id' }) },
  })),
}))

type NextAuthMock = jest.Mock & { __config?: unknown }

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn((config: unknown) => {
    // Store config on the mock function for retrieval in tests
    ;(jest.requireMock('next-auth').default as NextAuthMock).__config = config
    return {
      handlers: { GET: jest.fn(), POST: jest.fn() },
      signIn: jest.fn(),
      signOut: jest.fn(),
      auth: jest.fn(),
    }
  }),
}))

// ── Import auth.ts to trigger NextAuth() call ────────────────────────────────

import NextAuth from 'next-auth'
import { db } from '@/lib/db'
import { bestEffortRecordUserActivity } from '@/lib/user-activity'
import { IdentityConflictError, linkIdentityToUser, resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { consumeTelegramPreauthToken, recordTelegramLoginFailure } from '@/lib/telegram-auth'

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@/lib/auth')

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfig() {
  return (NextAuth as NextAuthMock).__config as {
    callbacks: {
      signIn: (args: Record<string, unknown>) => Promise<boolean>
      jwt: (args: Record<string, unknown>) => Promise<unknown>
      session: (args: Record<string, unknown>) => Promise<unknown>
    }
    providers: Array<{ id: string; authorize?: (creds: Record<string, string>) => Promise<unknown> }>
  }
}

function getProvider(id: string) {
  const config = getConfig()
  return config.providers.find((p) => p.id === id)
}

// Mock db chain for select queries
function mockDbSelect(rows: unknown[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
  ;(db.select as jest.Mock).mockReturnValue(chain)
  return chain
}

function mockDbUpdate() {
  const chain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
  }
  ;(db.update as jest.Mock).mockReturnValue(chain)
  return chain
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const SECRET = 'test-auth-secret'
const BOT_TOKEN = 'test-telegram-bot-token'
const ADMIN_EMAIL = 'admin@slowreading.club'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = SECRET
  process.env.AUTH_SECRET = SECRET
  process.env.ADMIN_EMAIL = ADMIN_EMAIL
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(linkIdentityToUser as jest.Mock).mockResolvedValue({
    id: 'identity-user',
    email: 'identity@test.com',
    name: 'Identity',
  })
  ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
    id: 'identity-user',
    email: 'identity@test.com',
    name: 'Identity',
  })
})

// ── signIn callback ──────────────────────────────────────────────────────────

describe('signIn callback', () => {
  const signInCallback = () => getConfig().callbacks.signIn

  it('не пишет denormalized auth columns и записывает sign_in activity', async () => {
    const result = await signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com' },
      account: { provider: 'google' },
    })

    expect(result).toBe(true)
    expect(db.update).not.toHaveBeenCalled()
    expect(bestEffortRecordUserActivity).toHaveBeenCalledWith('user-uuid', 'sign_in', expect.objectContaining({
      source: 'auth',
      sourceId: 'google',
      metadata: { provider: 'google' },
    }))
    expect(linkIdentityToUser).not.toHaveBeenCalled()
  })

  it('синхронизирует Google OAuth account в user_identities для canonical users.id', async () => {
    const result = await signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com', name: 'User', image: 'https://avatar.test/u.png' },
      account: { provider: 'google', providerAccountId: 'google-sub-123' },
    })

    expect(result).toBe(true)
    expect(linkIdentityToUser).toHaveBeenCalledWith('user-uuid', 'google', 'google-sub-123', expect.objectContaining({
      email: 'user@test.com',
      emailVerified: true,
      name: 'User',
      image: 'https://avatar.test/u.png',
      metadata: { source: 'auth-sign-in' },
    }))
  })

  it('синхронизирует Resend/email sign-in в user_identities', async () => {
    await signInCallback()({
      user: { id: 'email-user-uuid', email: 'magic@test.com', name: 'Magic User' },
      account: { provider: 'resend' },
    })

    expect(linkIdentityToUser).toHaveBeenCalledWith('email-user-uuid', 'email', 'magic@test.com', expect.objectContaining({
      email: 'magic@test.com',
      emailVerified: true,
      name: 'Magic User',
      metadata: { source: 'auth-sign-in' },
    }))
  })

  it('не создаёт email identity на pre-send фазе magic link', async () => {
    mockDbUpdate()

    const result = await signInCallback()({
      user: { email: 'not-yet-verified@test.com' },
      account: { provider: 'resend' },
      email: { verificationRequest: true },
    })

    expect(result).toBe(true)
    expect(db.update).not.toHaveBeenCalled()
    expect(linkIdentityToUser).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
    expect(bestEffortRecordUserActivity).not.toHaveBeenCalled()
  })

  it('нормализует resend provider в email для user_identities и activity', async () => {
    await signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com' },
      account: { provider: 'resend' },
    })

    expect(db.update).not.toHaveBeenCalled()
    expect(linkIdentityToUser).toHaveBeenCalledWith('user-uuid', 'email', 'user@test.com', expect.objectContaining({
      email: 'user@test.com',
    }))
    expect(bestEffortRecordUserActivity).toHaveBeenCalledWith('user-uuid', 'sign_in', expect.objectContaining({
      sourceId: 'email',
    }))
  })

  it('для magic link без id создаёт/резолвит email identity по email', async () => {
    await signInCallback()({
      user: { email: 'magic@test.com' },
      account: { provider: 'resend' },
    })

    expect(db.update).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('email', 'magic@test.com', expect.objectContaining({
      email: 'magic@test.com',
      emailVerified: true,
    }))
  })

  it('обрабатывает sign-in без account как email identity', async () => {
    await signInCallback()({
      user: { id: 'user-uuid', email: 'magic@test.com' },
      account: null,
    })

    expect(db.update).not.toHaveBeenCalled()
    expect(linkIdentityToUser).toHaveBeenCalledWith('user-uuid', 'email', 'magic@test.com', expect.objectContaining({
      email: 'magic@test.com',
      emailVerified: true,
    }))
  })

  it('не пишет legacy auth cache на sign-in без identity sync', async () => {
    await signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com' },
      account: { provider: 'email' },
    })

    expect(db.update).not.toHaveBeenCalled()
  })

  it('не прерывает вход на transient identity sync error для Google OAuth', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockDbUpdate()
    const error = new Error('temporary db timeout')
    ;(linkIdentityToUser as jest.Mock).mockRejectedValueOnce(error)

    const result = await signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com', name: 'User' },
      account: { provider: 'google', providerAccountId: 'google-sub-123' },
    })

    expect(result).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to sync user identity during sign-in',
      error
    )
    errorSpy.mockRestore()
  })

  it('не прерывает вход на transient identity sync error для email sign-in с userId', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockDbUpdate()
    const error = new Error('temporary db timeout')
    ;(linkIdentityToUser as jest.Mock).mockRejectedValueOnce(error)

    const result = await signInCallback()({
      user: { id: 'email-user-uuid', email: 'magic@test.com', name: 'Magic User' },
      account: { provider: 'resend' },
    })

    expect(result).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to sync user identity during sign-in',
      error
    )
    errorSpy.mockRestore()
  })

  it('не прерывает вход на transient identity sync error для magic link без userId', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockDbUpdate()
    const error = new Error('temporary db timeout')
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockRejectedValueOnce(error)

    const result = await signInCallback()({
      user: { email: 'magic@test.com' },
      account: { provider: 'resend' },
    })

    expect(result).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to sync user identity during sign-in',
      error
    )
    errorSpy.mockRestore()
  })

  it('не проглатывает conflict identity sync error', async () => {
    mockDbUpdate()
    ;(linkIdentityToUser as jest.Mock).mockRejectedValueOnce(
      new IdentityConflictError('Identity google:sub is already linked to another user')
    )

    await expect(signInCallback()({
      user: { id: 'user-uuid', email: 'user@test.com', name: 'User' },
      account: { provider: 'google', providerAccountId: 'google-sub-123' },
    })).rejects.toThrow(IdentityConflictError)
  })
})

// ── jwt callback ──────────────────────────────────────────────────────────────

describe('jwt callback', () => {
  const jwtCallback = () => getConfig().callbacks.jwt

  it('читает isAdmin=true из DB', async () => {
    mockDbSelect([{ id: 'admin-id', isAdmin: true }])

    const token = await jwtCallback()({
      token: { sub: 'admin-id', email: ADMIN_EMAIL },
      user: { id: 'admin-id', email: ADMIN_EMAIL },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).isAdmin).toBe(true)
  })

  it('читает isAdmin=false из DB даже для обычного email', async () => {
    mockDbSelect([{ id: 'user-id', isAdmin: false }])

    const token = await jwtCallback()({
      token: { sub: 'user-id', email: 'user@test.com' },
      user: { id: 'user-id', email: 'user@test.com' },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).isAdmin).toBe(false)
  })

  it('bootstrap-ит ADMIN_EMAIL в isAdmin если в DB ещё нет админов', async () => {
    const userSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'admin-id', isAdmin: false }]),
    }
    const adminSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(userSelect)
      .mockReturnValueOnce(adminSelect)
    mockDbUpdate()

    const token = await jwtCallback()({
      token: { sub: 'admin-id', email: ADMIN_EMAIL },
      user: { id: 'admin-id', email: ADMIN_EMAIL },
      account: { provider: 'google' },
    })

    expect((token as Record<string, unknown>).isAdmin).toBe(true)
    expect(db.update).toHaveBeenCalled()
  })

  it('устанавливает provider из account', async () => {
    mockDbSelect([{ id: 'user-id', isAdmin: false }])

    const token = await jwtCallback()({
      token: { sub: 'user-id' },
      user: { id: 'user-id', email: 'u@t.com' },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).provider).toBe('google')
  })

  it('возвращает null если пользователь удалён из DB (нет user, есть email)', async () => {
    delete process.env.NEXTAUTH_TEST_MODE
    mockDbSelect([]) // no user in DB

    const result = await jwtCallback()({
      token: { email: 'deleted@test.com' },
      user: undefined,
      account: null,
    })
    expect(result).toBeNull()
  })

  it('возвращает token если пользователь есть в DB', async () => {
    delete process.env.NEXTAUTH_TEST_MODE
    mockDbSelect([{ id: 'user-uuid', isAdmin: false }])

    const result = await jwtCallback()({
      token: { email: 'active@test.com' },
      user: undefined,
      account: null,
    })
    expect(result).not.toBeNull()
  })

  it('пропускает DB-проверку в NEXTAUTH_TEST_MODE', async () => {
    process.env.NEXTAUTH_TEST_MODE = 'true'

    const result = await jwtCallback()({
      token: { email: 'any@test.com' },
      user: undefined,
      account: null,
    })

    expect(db.select).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    delete process.env.NEXTAUTH_TEST_MODE
  })
})

// ── session callback ──────────────────────────────────────────────────────────

describe('session callback', () => {
  const sessionCallback = () => getConfig().callbacks.session

  it('проставляет user.id из token.sub', async () => {
    const session = { user: { email: 'u@t.com' } }
    const result = await sessionCallback()({
      session,
      token: { sub: 'user-uuid-123', isAdmin: false },
    })
    expect((result as { user: { id: string } }).user.id).toBe('user-uuid-123')
  })

  it('проставляет isAdmin из token', async () => {
    const session = { user: { email: 'u@t.com' } }
    const result = await sessionCallback()({
      session,
      token: { sub: 'uid', isAdmin: true },
    })
    expect((result as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true)
  })

  it('проставляет provider из token', async () => {
    const session = { user: { email: 'u@t.com' } }
    const result = await sessionCallback()({
      session,
      token: { sub: 'uid', provider: 'telegram' },
    })
    expect((result as { user: { provider: string } }).user.provider).toBe('telegram')
  })

  it('не падает если session.user отсутствует', async () => {
    const session = {}
    const result = await sessionCallback()({ session, token: { sub: 'uid' } })
    expect(result).toEqual({}) // no user → session returned as-is
  })
})

// ── telegram-preauth provider ─────────────────────────────────────────────────

describe('telegram-preauth authorize', () => {
  let authorize: (creds: Record<string, string>) => Promise<unknown>

  beforeAll(() => {
    const provider = getProvider('telegram-preauth')
    authorize = provider!.authorize!
  })

  beforeEach(() => {
    ;(recordTelegramLoginFailure as jest.Mock).mockResolvedValue(undefined)
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)
  })

  it('возвращает null если token/ts отсутствуют', async () => {
    expect(await authorize({ token: '', ts: '1' })).toBeNull()
    expect(await authorize({ token: 'x', ts: '' })).toBeNull()
  })

  it('возвращает null если токен протух (> 5 минут)', async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 6 * 60)
    const token = 'token'
    const result = await authorize({ token, ts: staleTs })
    expect(result).toBeNull()
  })

  it('возвращает null если одноразовый токен не найден или уже использован', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)

    const result = await authorize({ token: 'token', ts })

    expect(result).toBeNull()
  })

  it('возвращает null если ts не число', async () => {
    const result = await authorize({ token: 'token', ts: 'not-a-number' })

    expect(result).toBeNull()
    expect(consumeTelegramPreauthToken).not.toHaveBeenCalled()
  })

  it('возвращает null если пользователь не найден в DB', async () => {
    const uid = 'ghost-user'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = 'token'

    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(uid)
    mockDbSelect([])

    const result = await authorize({ token, ts })
    expect(result).toBeNull()
  })

  it('возвращает пользователя при валидных данных', async () => {
    const uid = 'real-user-id'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = 'token'

    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(uid)
    mockDbSelect([{ id: uid, contactEmail: null, name: 'Ivan' }])

    const result = await authorize({ token, ts })

    expect(result).toMatchObject({
      id: uid,
      email: null,
      name: 'Ivan',
    })
  })

  it('возвращает пользователя без технического telegramUsername если username не передан', async () => {
    const uid = 'user-no-username'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = 'token'

    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(uid)
    mockDbSelect([{ id: uid, email: 'tg@telegram.user', name: 'Ivan' }])

    const result = (await authorize({ token, ts })) as Record<string, unknown>
    expect(result.telegramUsername).toBeUndefined()
  })

  // ── recordTelegramLoginFailure вызывается на каждой точке отказа ──────────

  it('записывает preauth_no_token_ts при отсутствии token/ts', async () => {
    await authorize({ token: '', ts: '1' })
    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'preauth_no_token_ts', hasHash: false })
    )
  })

  it('записывает preauth_stale_ts при протухшем ts', async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 6 * 60)
    await authorize({ token: 'tok', ts: staleTs })
    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'preauth_stale_ts', hasHash: false })
    )
  })

  it('записывает preauth_stale_ts при нечисловом ts', async () => {
    await authorize({ token: 'tok', ts: 'not-a-number' })
    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'preauth_stale_ts', hasHash: false })
    )
  })

  it('записывает preauth_consume_null если одноразовый токен не найден', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)

    await authorize({ token: 'token', ts })

    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'preauth_consume_null', hasHash: false })
    )
  })

  it('записывает preauth_user_missing если пользователь не найден в DB', async () => {
    const uid = 'ghost-user'
    const ts = String(Math.floor(Date.now() / 1000))

    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(uid)
    mockDbSelect([])

    await authorize({ token: 'token', ts })

    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'preauth_user_missing', hasHash: false })
    )
  })

  it('НЕ вызывает recordTelegramLoginFailure при успешном входе', async () => {
    const uid = 'real-user-id'
    const ts = String(Math.floor(Date.now() / 1000))

    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(uid)
    mockDbSelect([{ id: uid, contactEmail: null, name: 'Ivan' }])

    await authorize({ token: 'token', ts })

    expect(recordTelegramLoginFailure).not.toHaveBeenCalled()
  })
})

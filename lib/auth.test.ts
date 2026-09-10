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

jest.mock('@/lib/telegram-auth', () => ({}))

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
  loadLoginPersonProperties: jest.fn(),
}))

jest.mock('@/lib/auth-analytics', () => ({
  trackAuthFailed: jest.fn(),
  trackAuthSucceeded: jest.fn(),
  applyLoginPersonProperties: jest.fn(),
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
import { IdentityConflictError, linkIdentityToUser, loadLoginPersonProperties, resolveOrCreateUserFromIdentity } from '@/lib/user-identities'
import { applyLoginPersonProperties, trackAuthSucceeded } from '@/lib/auth-analytics'

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

// ── аналитика входа через адаптер NextAuth ───────────────────────────────────
// Google и ссылка из письма идут мимо resolveOrCreateUserFromIdentity: пользователя
// создаёт/находит адаптер, а identity мы лишь до-связываем. Раньше этот путь не
// отправлял ни auth_succeeded, ни свойства персоны — в PostHog такие входы
// выглядели как «этим способом никто не входит», а человек оставался безымянным.
describe('signIn callback: аналитика входа через Google и почту', () => {
  const signInCallback = () => getConfig().callbacks.signIn
  const person = {
    name: 'Google User',
    telegramUsername: null,
    providers: ['google'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isAdmin: false,
  }

  beforeEach(() => {
    mockDbUpdate();
    (loadLoginPersonProperties as jest.Mock).mockResolvedValue(person)
  })

  it('отправляет auth_succeeded и свойства персоны при входе через Google', async () => {
    await signInCallback()({
      user: { id: 'google-user-uuid', email: 'g@test.com', name: 'Google User' },
      account: { provider: 'google', providerAccountId: 'google-123' },
    })

    expect(trackAuthSucceeded).toHaveBeenCalledWith('google-user-uuid', 'google', false, 'adapter')
    expect(applyLoginPersonProperties).toHaveBeenCalledWith('google-user-uuid', person)
  })

  it('отправляет auth_succeeded при входе по ссылке из письма', async () => {
    await signInCallback()({
      user: { id: 'email-user-uuid', email: 'magic@test.com', name: 'Magic User' },
      account: { provider: 'resend' },
    })

    expect(trackAuthSucceeded).toHaveBeenCalledWith('email-user-uuid', 'email', false, 'adapter')
    expect(applyLoginPersonProperties).toHaveBeenCalledWith('email-user-uuid', person)
  })

  it('помечает вход как регистрацию, если аккаунт создан только что', async () => {
    (loadLoginPersonProperties as jest.Mock).mockResolvedValue({ ...person, createdAt: new Date() })

    await signInCallback()({
      user: { id: 'fresh-uuid', email: 'fresh@test.com', name: 'Fresh' },
      account: { provider: 'google', providerAccountId: 'google-fresh' },
    })

    expect(trackAuthSucceeded).toHaveBeenCalledWith('fresh-uuid', 'google', true, 'adapter')
  })

  it('не ломает вход, если отправка аналитики упала', async () => {
    (trackAuthSucceeded as jest.Mock).mockRejectedValueOnce(new Error('posthog down'))

    const result = await signInCallback()({
      user: { id: 'google-user-uuid', email: 'g@test.com', name: 'Google User' },
      account: { provider: 'google', providerAccountId: 'google-123' },
    })

    expect(result).toBe(true)
  })

  it('не отправляет auth_succeeded на pre-send фазе magic link', async () => {
    await signInCallback()({
      user: { email: 'not-yet@test.com' },
      account: { provider: 'resend' },
      email: { verificationRequest: true },
    })

    expect(trackAuthSucceeded).not.toHaveBeenCalled()
    expect(applyLoginPersonProperties).not.toHaveBeenCalled()
  })

  it('не отправляет auth_succeeded, если привязка identity упала конфликтом', async () => {
    (linkIdentityToUser as jest.Mock).mockRejectedValueOnce(new IdentityConflictError('busy'))

    await expect(signInCallback()({
      user: { id: 'google-user-uuid', email: 'g@test.com', name: 'Google User' },
      account: { provider: 'google', providerAccountId: 'google-123' },
    })).rejects.toThrow(IdentityConflictError)

    expect(trackAuthSucceeded).not.toHaveBeenCalled()
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


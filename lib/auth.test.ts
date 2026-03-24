/**
 * @jest-environment node
 *
 * Tests for lib/auth.ts:
 * - jwt callback (isAdmin, telegramUsername, provider, deleted user)
 * - session callback (user.id, isAdmin, telegramUsername, provider)
 * - telegram-preauth provider authorize (HMAC, freshness, DB lookup)
 * - telegram provider authorize (verifyTelegramHash, DB upsert)
 */

import { createHash, createHmac } from 'crypto'

// ── Mocks (must be before imports) ───────────────────────────────────────────

jest.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: jest.fn(() => ({})),
}))

jest.mock('@/lib/db', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}))

jest.mock('@/lib/auth.google-one-tap', () => ({
  authorizeGoogleOneTap: jest.fn(),
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@/lib/auth')

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfig() {
  return (NextAuth as NextAuthMock).__config as {
    callbacks: {
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

// Mock db chain for insert with onConflictDoUpdate
function mockDbInsert() {
  const chain = {
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
  }
  ;(db.insert as jest.Mock).mockReturnValue(chain)
  return chain
}

// Build a valid telegram-preauth token
function buildPreauthToken(uid: string, ts: string, secret: string): string {
  return createHmac('sha256', secret).update(`${uid}:${ts}`).digest('hex')
}

// Build a valid Telegram Widget hash
function buildTelegramHash(data: Record<string, string>, botToken: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _omit, ...rest } = data
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  return createHmac('sha256', secret).update(checkString).digest('hex')
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
})

// ── jwt callback ──────────────────────────────────────────────────────────────

describe('jwt callback', () => {
  const jwtCallback = () => getConfig().callbacks.jwt

  it('устанавливает isAdmin=true для admin email', async () => {
    const token = await jwtCallback()({
      token: { email: ADMIN_EMAIL },
      user: { email: ADMIN_EMAIL },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).isAdmin).toBe(true)
  })

  it('устанавливает isAdmin=false для обычного email', async () => {
    const token = await jwtCallback()({
      token: { email: 'user@test.com' },
      user: { email: 'user@test.com' },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).isAdmin).toBe(false)
  })

  it('устанавливает provider из account', async () => {
    const token = await jwtCallback()({
      token: {},
      user: { email: 'u@t.com' },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).provider).toBe('google')
  })

  it('устанавливает telegramUsername из user', async () => {
    const token = await jwtCallback()({
      token: {},
      user: { email: 'u@t.com', telegramUsername: 'ivan_tg' },
      account: { provider: 'telegram-preauth' },
    })
    expect((token as Record<string, unknown>).telegramUsername).toBe('ivan_tg')
  })

  it('сохраняет telegramUsername из токена если user не передаёт', async () => {
    const token = await jwtCallback()({
      token: { telegramUsername: 'existing_tg' },
      user: { email: 'u@t.com' },
      account: { provider: 'google' },
    })
    expect((token as Record<string, unknown>).telegramUsername).toBe('existing_tg')
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
    mockDbSelect([{ id: 'user-uuid' }])

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

  it('проставляет telegramUsername из token', async () => {
    const session = { user: { email: 'u@t.com' } }
    const result = await sessionCallback()({
      session,
      token: { sub: 'uid', telegramUsername: 'my_tg' },
    })
    expect((result as { user: { telegramUsername: string } }).user.telegramUsername).toBe('my_tg')
  })

  it('проставляет provider из token', async () => {
    const session = { user: { email: 'u@t.com' } }
    const result = await sessionCallback()({
      session,
      token: { sub: 'uid', provider: 'telegram-preauth' },
    })
    expect((result as { user: { provider: string } }).user.provider).toBe('telegram-preauth')
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

  it('возвращает null если uid/token/ts отсутствуют', async () => {
    expect(await authorize({ uid: '', token: 'x', ts: '1' })).toBeNull()
    expect(await authorize({ uid: 'u', token: '', ts: '1' })).toBeNull()
    expect(await authorize({ uid: 'u', token: 'x', ts: '' })).toBeNull()
  })

  it('возвращает null если токен протух (> 300 сек)', async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 400)
    const token = buildPreauthToken('user-id', staleTs, SECRET)
    const result = await authorize({ uid: 'user-id', token, ts: staleTs })
    expect(result).toBeNull()
  })

  it('возвращает null если HMAC неверен', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const result = await authorize({ uid: 'user-id', token: 'a'.repeat(64), ts })
    expect(result).toBeNull()
  })

  it('возвращает null если пользователь не найден в DB', async () => {
    const uid = 'ghost-user'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = buildPreauthToken(uid, ts, SECRET)

    mockDbSelect([])

    const result = await authorize({ uid, token, ts })
    expect(result).toBeNull()
  })

  it('возвращает пользователя при валидных данных', async () => {
    const uid = 'real-user-id'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = buildPreauthToken(uid, ts, SECRET)

    mockDbSelect([{ id: uid, email: 'tg@telegram.user', name: 'Ivan' }])

    const result = await authorize({ uid, token, ts, username: 'ivan_tg' })

    expect(result).toMatchObject({
      id: uid,
      email: 'tg@telegram.user',
      name: 'Ivan',
      telegramUsername: 'ivan_tg',
    })
  })

  it('возвращает telegramUsername=null если username не передан', async () => {
    const uid = 'user-no-username'
    const ts = String(Math.floor(Date.now() / 1000))
    const token = buildPreauthToken(uid, ts, SECRET)

    mockDbSelect([{ id: uid, email: 'tg@telegram.user', name: 'Ivan' }])

    const result = (await authorize({ uid, token, ts })) as Record<string, unknown>
    expect(result.telegramUsername).toBeNull()
  })
})

// ── telegram provider ─────────────────────────────────────────────────────────

describe('telegram provider authorize + verifyTelegramHash', () => {
  let authorize: (creds: Record<string, string>) => Promise<unknown>

  beforeAll(() => {
    const provider = getProvider('telegram')
    authorize = provider!.authorize!
  })

  it('возвращает null если hash неверен', async () => {
    const result = await authorize({
      id: '123',
      first_name: 'Ivan',
      auth_date: String(Math.floor(Date.now() / 1000)),
      hash: 'invalid-hash',
    })
    expect(result).toBeNull()
  })

  it('возвращает null если TELEGRAM_BOT_TOKEN не задан', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN

    const result = await authorize({
      id: '123',
      first_name: 'Ivan',
      auth_date: String(Math.floor(Date.now() / 1000)),
      hash: 'some-hash',
    })

    expect(result).toBeNull()
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
  })

  it('создаёт пользователя и возвращает его при валидных данных', async () => {
    const data = {
      id: '987654321',
      first_name: 'Ivan',
      last_name: 'Petrov',
      username: 'ivan_p',
      photo_url: 'https://t.me/photo.jpg',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    const hash = buildTelegramHash(data, BOT_TOKEN)
    mockDbInsert()

    const result = await authorize({ ...data, hash })

    expect(result).toMatchObject({
      id: 'telegram:987654321',
      email: 'telegram:987654321@telegram.user',
      name: 'Ivan Petrov',
      telegramUsername: 'ivan_p',
    })
  })

  it('устанавливает image из photo_url', async () => {
    const data = {
      id: '111',
      first_name: 'Anna',
      photo_url: 'https://t.me/photo.jpg',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    const hash = buildTelegramHash(data, BOT_TOKEN)
    const insertChain = mockDbInsert()

    await authorize({ ...data, hash })

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'https://t.me/photo.jpg' })
    )
  })

  it('использует username как имя если first_name и last_name пусты', async () => {
    const data = {
      id: '222',
      username: 'noname_user',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    const hash = buildTelegramHash(data, BOT_TOKEN)
    mockDbInsert()

    const result = (await authorize({ ...data, hash })) as Record<string, unknown>
    expect(result.name).toBe('noname_user')
  })

  it('использует id как имя если нет first_name/last_name/username', async () => {
    const data = {
      id: '333',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    const hash = buildTelegramHash(data, BOT_TOKEN)
    mockDbInsert()

    const result = (await authorize({ ...data, hash })) as Record<string, unknown>
    expect(result.name).toBe('333')
  })

  it('устанавливает image=null если photo_url отсутствует', async () => {
    const data = {
      id: '444',
      first_name: 'No Photo',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }
    const hash = buildTelegramHash(data, BOT_TOKEN)
    const insertChain = mockDbInsert()

    await authorize({ ...data, hash })

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ image: null })
    )
  })
})


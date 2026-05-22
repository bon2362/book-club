/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST, DELETE } from './route'

jest.mock('@auth/core/jwt', () => ({
  encode: jest.fn().mockResolvedValue('encoded-session-token'),
}))

jest.mock('@/lib/db', () => ({
  db: {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

jest.mock('@/lib/user-identities', () => ({
  normalizeIdentityProvider: jest.fn((provider: string) => provider === 'telegram-preauth' ? 'telegram' : provider),
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

import { encode } from '@auth/core/jwt'
import { db } from '@/lib/db'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
  })
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/test/session', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('/api/test/session guards', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalTestMode = process.env.NEXTAUTH_TEST_MODE

  afterEach(() => {
    setNodeEnv(originalNodeEnv)
    if (originalTestMode === undefined) {
      delete process.env.NEXTAUTH_TEST_MODE
    } else {
      process.env.NEXTAUTH_TEST_MODE = originalTestMode
    }
    jest.clearAllMocks()
  })

  it('[SEC] POST возвращает 403 в production даже если NEXTAUTH_TEST_MODE=true', async () => {
    setNodeEnv('production')
    process.env.NEXTAUTH_TEST_MODE = 'true'

    const res = await POST(makeRequest({ email: 'admin@test.com', name: 'Admin', isAdmin: true }))

    expect(res.status).toBe(403)
  })

  it('[SEC] DELETE возвращает 403 в production даже если NEXTAUTH_TEST_MODE=true', async () => {
    setNodeEnv('production')
    process.env.NEXTAUTH_TEST_MODE = 'true'

    const res = await DELETE(makeRequest({ email: 'admin@test.com' }))

    expect(res.status).toBe(403)
  })

  it('POST работает в test mode вне production', async () => {
    setNodeEnv('test')
    process.env.NEXTAUTH_TEST_MODE = 'true'
    process.env.NEXTAUTH_SECRET = 'secret'
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'canonical-test-uuid',
      email: 'user@test.com',
      contactEmail: 'user@test.com',
      name: 'User',
    })

    const res = await POST(makeRequest({ email: 'user@test.com', name: 'User' }))

    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('email', 'user@test.com', expect.objectContaining({
      email: 'user@test.com',
      name: 'User',
      metadata: { source: 'test-session' },
    }))
    const updateChain = (db.update as jest.Mock).mock.results[0].value
    expect(updateChain.set).toHaveBeenCalledWith(expect.not.objectContaining({
      authProvider: expect.anything(),
      lastSignInAt: expect.anything(),
    }))
    expect(encode).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.objectContaining({ sub: 'canonical-test-uuid' }),
    }))
  })

  it('POST для telegram-preauth создаёт session на canonical UUID, не на test:* id', async () => {
    setNodeEnv('test')
    process.env.NEXTAUTH_TEST_MODE = 'true'
    process.env.NEXTAUTH_SECRET = 'secret'
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'telegram-canonical-uuid',
      email: null,
      contactEmail: null,
      name: 'Telegram User',
    })

    const res = await POST(makeRequest({
      email: 'tg@test.com',
      name: 'Telegram User',
      telegramUsername: 'reader_tg',
      provider: 'telegram-preauth',
    }))

    expect(res.status).toBe(200)
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('telegram', 'reader_tg', expect.objectContaining({
      email: null,
      telegramUsername: 'reader_tg',
    }))
    expect(encode).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.objectContaining({ sub: 'telegram-canonical-uuid', email: null, contactEmail: null }),
    }))
  })
})

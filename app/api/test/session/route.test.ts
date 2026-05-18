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
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

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

    const res = await POST(makeRequest({ email: 'user@test.com', name: 'User' }))

    expect(res.status).toBe(200)
  })
})

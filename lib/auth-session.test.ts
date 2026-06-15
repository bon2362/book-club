/**
 * @jest-environment node
 *
 * Unit-тесты для lib/auth-session.ts — issueServerSession.
 * Проверяет: имя куки и salt для secure=true/false, поля токена, флаги куки.
 */

jest.mock('@auth/core/jwt', () => ({
  encode: jest.fn().mockResolvedValue('mocked-encoded-token'),
}))

import { NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { issueServerSession, SESSION_MAX_AGE_SECONDS } from './auth-session'

const SECRET = 'test-auth-secret-long-enough-for-jwt-32ch'

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET
  jest.clearAllMocks()
})

afterEach(() => {
  delete process.env.AUTH_SECRET
})

describe('issueServerSession', () => {
  describe('secure=false (HTTP / dev)', () => {
    it('ставит куку с именем authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1', name: 'Иван', provider: 'telegram' }, { secure: false })

      const cookie = res.cookies.get('authjs.session-token')
      expect(cookie).toBeDefined()
      expect(cookie?.value).toBe('mocked-encoded-token')
    })

    it('вызывает encode с salt = authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        salt: 'authjs.session-token',
      }))
    })

    it('НЕ ставит куку с именем __Secure-authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      expect(res.cookies.get('__Secure-authjs.session-token')).toBeUndefined()
    })
  })

  describe('secure=true (HTTPS / prod)', () => {
    it('ставит куку с именем __Secure-authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1', name: 'Иван', provider: 'telegram' }, { secure: true })

      const cookie = res.cookies.get('__Secure-authjs.session-token')
      expect(cookie).toBeDefined()
      expect(cookie?.value).toBe('mocked-encoded-token')
    })

    it('вызывает encode с salt = __Secure-authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: true })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        salt: '__Secure-authjs.session-token',
      }))
    })

    it('НЕ ставит куку с именем authjs.session-token', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: true })

      expect(res.cookies.get('authjs.session-token')).toBeUndefined()
    })
  })

  describe('поля токена', () => {
    it('передаёт sub, email, name, provider в encode', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, {
        userId: 'user-42',
        email: 'user@test.com',
        name: 'Test User',
        provider: 'telegram',
      }, { secure: false })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        token: expect.objectContaining({
          sub: 'user-42',
          email: 'user@test.com',
          name: 'Test User',
          provider: 'telegram',
        }),
      }))
    })

    it('isAdmin попадает в токен только если передан', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1', isAdmin: true }, { secure: false })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        token: expect.objectContaining({ isAdmin: true }),
      }))
    })

    it('isAdmin НЕ попадает в токен если не передан', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      const callArgs = (encode as jest.Mock).mock.calls[0][0]
      expect(callArgs.token).not.toHaveProperty('isAdmin')
    })

    it('contactEmail попадает в токен только если передан', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1', contactEmail: 'contact@test.com' }, { secure: false })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        token: expect.objectContaining({ contactEmail: 'contact@test.com' }),
      }))
    })

    it('contactEmail НЕ попадает в токен если не передан', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      const callArgs = (encode as jest.Mock).mock.calls[0][0]
      expect(callArgs.token).not.toHaveProperty('contactEmail')
    })
  })

  describe('флаги куки', () => {
    it('устанавливает httpOnly, sameSite lax, path /, maxAge по умолчанию', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      const cookie = res.cookies.get('authjs.session-token')
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.sameSite).toBe('lax')
      expect(cookie?.path).toBe('/')
      expect(cookie?.maxAge).toBe(SESSION_MAX_AGE_SECONDS)
    })

    it('использует кастомный maxAgeSeconds если передан', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false, maxAgeSeconds: 86400 })

      const cookie = res.cookies.get('authjs.session-token')
      expect(cookie?.maxAge).toBe(86400)
    })

    it('secure=false → кука не имеет флага secure', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      const cookie = res.cookies.get('authjs.session-token')
      expect(cookie?.secure).toBe(false)
    })

    it('secure=true → кука имеет флаг secure', async () => {
      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: true })

      const cookie = res.cookies.get('__Secure-authjs.session-token')
      expect(cookie?.secure).toBe(true)
    })
  })

  describe('использование секрета', () => {
    it('предпочитает AUTH_SECRET над NEXTAUTH_SECRET', async () => {
      process.env.AUTH_SECRET = 'auth-secret-value'
      process.env.NEXTAUTH_SECRET = 'nextauth-secret-value'

      const res = NextResponse.json({})
      await issueServerSession(res, { userId: 'user-1' }, { secure: false })

      expect(encode).toHaveBeenCalledWith(expect.objectContaining({
        secret: 'auth-secret-value',
      }))

      delete process.env.NEXTAUTH_SECRET
    })
  })
})

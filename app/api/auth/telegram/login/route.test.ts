/**
 * @jest-environment node
 *
 * Unit-тесты для GET /api/auth/telegram/login
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/telegram-auth', () => ({
  consumeTelegramPreauthToken: jest.fn(),
  recordTelegramLoginFailure: jest.fn(),
}))

jest.mock('@/lib/auth-session', () => ({
  issueServerSession: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}))

import { consumeTelegramPreauthToken, recordTelegramLoginFailure } from '@/lib/telegram-auth'
import { issueServerSession } from '@/lib/auth-session'
import { db } from '@/lib/db'
import { GET } from './route'

function makeRequest(token?: string): NextRequest {
  const url = new URL('http://localhost/api/auth/telegram/login')
  if (token) url.searchParams.set('token', token)
  return new NextRequest(url.toString())
}

describe('GET /api/auth/telegram/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(issueServerSession as jest.Mock).mockResolvedValue(undefined)
    ;(recordTelegramLoginFailure as jest.Mock).mockResolvedValue(undefined)
    // mock db.select chain
    ;(db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ name: 'Иван', contactEmail: 'ivan@example.com' }]),
        }),
      }),
    })
  })

  it('валидный токен → issueServerSession вызван + redirect 307 на /', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue('user-uuid')

    const res = await GET(makeRequest('valid-token'))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    const url = new URL(location)
    expect(url.pathname).toBe('/')
    expect(url.searchParams.has('auth')).toBe(false)

    expect(issueServerSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-uuid', provider: 'telegram' }),
      expect.objectContaining({ secure: false }),
    )
    expect(recordTelegramLoginFailure).not.toHaveBeenCalled()
  })

  it('невалидный токен (consume→null) → recordTelegramLoginFailure + redirect /?auth=failed', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)

    const res = await GET(makeRequest('bad-token'))

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')

    expect(recordTelegramLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'bot_token_invalid' }),
    )
    expect(issueServerSession).not.toHaveBeenCalled()
  })

  it('нет параметра token → recordTelegramLoginFailure + redirect /?auth=failed', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('auth')).toBe('failed')

    expect(recordTelegramLoginFailure).toHaveBeenCalled()
    expect(issueServerSession).not.toHaveBeenCalled()
  })
})

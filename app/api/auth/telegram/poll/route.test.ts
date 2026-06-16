/**
 * @jest-environment node
 *
 * Unit-тесты для GET /api/auth/telegram/poll (поллинг входа через бота)
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/telegram-auth', () => ({
  consumeTelegramPreauthToken: jest.fn(),
}))

jest.mock('@/lib/auth-session', () => ({
  issueServerSession: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue([{ name: 'Иван', contactEmail: null }]),
        })),
      })),
    })),
  },
}))

import { consumeTelegramPreauthToken } from '@/lib/telegram-auth'
import { issueServerSession } from '@/lib/auth-session'
import { GET } from './route'

function makeRequest(nonce?: string): NextRequest {
  const url = new URL('http://localhost/api/auth/telegram/poll')
  if (nonce !== undefined) url.searchParams.set('nonce', nonce)
  return new NextRequest(url.toString())
}

describe('GET /api/auth/telegram/poll', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(issueServerSession as jest.Mock).mockResolvedValue(undefined)
  })

  it('nonce привязан → issueServerSession вызван, status ok', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue('user-uuid')
    const res = await GET(makeRequest('nonce-1'))
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(issueServerSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-uuid', provider: 'telegram' }),
      expect.objectContaining({ secure: false }),
    )
  })

  it('nonce не привязан → status pending, без сессии', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)
    const res = await GET(makeRequest('nonce-2'))
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(issueServerSession).not.toHaveBeenCalled()
  })

  it('нет nonce → status pending', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(consumeTelegramPreauthToken).not.toHaveBeenCalled()
    expect(issueServerSession).not.toHaveBeenCalled()
  })
})

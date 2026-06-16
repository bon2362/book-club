/**
 * @jest-environment node
 *
 * Unit-тесты для POST /api/account/identities/telegram/link-start
 */
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/telegram-auth', () => ({ createTelegramPreauthToken: jest.fn() }))

import { auth } from '@/lib/auth'
import { createTelegramPreauthToken } from '@/lib/telegram-auth'
import { POST } from './route'

describe('POST /api/account/identities/telegram/link-start', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('без сессии → 401, без чеканки', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(createTelegramPreauthToken).not.toHaveBeenCalled()
  })

  it('с сессией → 200 + nonce, привязанный к userId', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(createTelegramPreauthToken as jest.Mock).mockResolvedValue({ token: 'nonce-xyz', expiresAt: new Date() })
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nonce).toBe('nonce-xyz')
    expect(createTelegramPreauthToken).toHaveBeenCalledWith('u1')
  })
})

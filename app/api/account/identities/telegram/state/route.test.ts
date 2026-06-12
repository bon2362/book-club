/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/account-linking-state', () => ({
  createTelegramAccountLinkState: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { createTelegramAccountLinkState } from '@/lib/account-linking-state'

describe('GET /api/account/identities/telegram/state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 401 без сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await GET(new NextRequest('http://localhost/api/account/identities/telegram/state'))

    expect(res.status).toBe(401)
    expect(createTelegramAccountLinkState).not.toHaveBeenCalled()
  })

  it('возвращает signed state и callback authUrl для текущего user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
    ;(createTelegramAccountLinkState as jest.Mock).mockReturnValue('signed-state')

    const res = await GET(new NextRequest('https://www.slowreading.club/api/account/identities/telegram/state'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(createTelegramAccountLinkState).toHaveBeenCalledWith('user-1')
    expect(body).toEqual({
      state: 'signed-state',
      authUrl: 'https://www.slowreading.club/api/account/identities/telegram/callback?state=signed-state',
    })
  })
})

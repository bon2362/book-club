/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST } from './route'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ auditTx: true }),
}))

jest.mock('@/lib/google-credential', () => ({
  verifyGoogleCredential: jest.fn(),
}))

jest.mock('@/lib/user-identities', () => ({
  IdentityConflictError: class IdentityConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'IdentityConflictError'
    }
  },
  linkVerifiedIdentityToUser: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { verifyGoogleCredential } from '@/lib/google-credential'
import { IdentityConflictError, linkVerifiedIdentityToUser } from '@/lib/user-identities'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/account/identities/google', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/account/identities/google', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 401 без сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await POST(makeRequest({ credential: 'credential' }))

    expect(res.status).toBe(401)
  })

  it('возвращает 400 при невалидном credential', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue(null)

    const res = await POST(makeRequest({ credential: 'bad' }))

    expect(res.status).toBe(400)
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('возвращает 400 если verified Google credential не содержит email', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue({
      sub: 'google-sub-123',
      email_verified: true,
    })

    const res = await POST(makeRequest({ credential: 'credential' }))

    expect(res.status).toBe(400)
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('возвращает 409 при conflict identity', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue({
      sub: 'google-sub-123',
      email: 'user@example.com',
      name: 'User',
      picture: 'https://avatar.test/u.png',
      email_verified: true,
    })
    ;(linkVerifiedIdentityToUser as jest.Mock).mockRejectedValueOnce(
      new IdentityConflictError('Identity google:google-sub-123 is already linked to another user')
    )

    const res = await POST(makeRequest({ credential: 'credential' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'identity_conflict' })
  })

  it('линкует verified Google identity к текущему user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User', email: 'user@test.com' } })
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue({
      sub: 'google-sub-123',
      email: 'user@example.com',
      name: 'User',
      picture: 'https://avatar.test/u.png',
      email_verified: true,
    })
    ;(linkVerifiedIdentityToUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      name: 'User',
    })

    const res = await POST(makeRequest({ credential: 'credential' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      identity: {
        provider: 'google',
        email: 'user@example.com',
        telegramUsername: null,
        lastSeenAt: expect.any(String),
      },
    })
    expect(linkVerifiedIdentityToUser).toHaveBeenCalledWith('user-1', 'google', 'google-sub-123', expect.objectContaining({
      email: 'user@example.com',
      emailVerified: true,
      name: 'User',
      image: 'https://avatar.test/u.png',
      metadata: { source: 'account-linking-google' },
      now: expect.any(Date),
    }), expect.objectContaining({ auditTx: true }))
  })
})

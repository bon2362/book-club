/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET } from './route'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ auditTx: true }),
}))

jest.mock('@/lib/account-email-linking', () => ({
  consumeEmailAccountLinkToken: jest.fn(),
  parseEmailAccountLinkIdentifier: jest.fn(),
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
import { consumeEmailAccountLinkToken, parseEmailAccountLinkIdentifier } from '@/lib/account-email-linking'
import { IdentityConflictError, linkVerifiedIdentityToUser } from '@/lib/user-identities'

function makeRequest(params: Record<string, string>) {
  const url = new URL('https://www.slowreading.club/api/account/identities/email/callback')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new NextRequest(url.toString())
}

function redirectStatus(res: Response): string | null {
  const location = res.headers.get('location')
  return location ? new URL(location).searchParams.get('account_link') : null
}

describe('GET /api/account/identities/email/callback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(parseEmailAccountLinkIdentifier as jest.Mock).mockReturnValue({
      userId: 'user-1',
      email: 'user@test.com',
    })
    ;(consumeEmailAccountLinkToken as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      email: 'user@test.com',
    })
  })

  it('редиректит без сессии и не линкует email', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await GET(makeRequest({ identifier: 'identifier', token: 'token' }))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('email_unauthorized')
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('редиректит если token не принадлежит текущей сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'other-user', name: 'Other' } })

    const res = await GET(makeRequest({ identifier: 'identifier', token: 'token' }))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('email_state_failed')
    expect(consumeEmailAccountLinkToken).not.toHaveBeenCalled()
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  it('линкует confirmed email identity к текущему user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })

    const res = await GET(makeRequest({ identifier: 'identifier', token: 'token' }))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('email_ok')
    expect(linkVerifiedIdentityToUser).toHaveBeenCalledWith('user-1', 'email', 'user@test.com', expect.objectContaining({
      email: 'user@test.com',
      emailVerified: true,
      metadata: { source: 'account-linking-email' },
      now: expect.any(Date),
    }), expect.objectContaining({ auditTx: true }))
  })

  it('редиректит conflict если email уже у другого user', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })
    ;(linkVerifiedIdentityToUser as jest.Mock).mockRejectedValueOnce(
      new IdentityConflictError('Identity email:user@test.com is already linked to another user')
    )

    const res = await GET(makeRequest({ identifier: 'identifier', token: 'token' }))

    expect(res.status).toBe(307)
    expect(redirectStatus(res)).toBe('email_conflict')
  })
})

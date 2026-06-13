/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST } from './route'

const mockSend = jest.fn().mockResolvedValue({ id: 'email-id' })

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ auditTx: true }),
}))

jest.mock('@/lib/account-email-linking', () => ({
  createEmailAccountLinkToken: jest.fn(),
  normalizeAccountLinkEmail: jest.fn((email: string) => email.trim().toLowerCase()),
}))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

import { auth } from '@/lib/auth'
import { createEmailAccountLinkToken } from '@/lib/account-email-linking'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://www.slowreading.club/api/account/identities/email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/account/identities/email', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    jest.clearAllMocks()
    ;(createEmailAccountLinkToken as jest.Mock).mockResolvedValue({
      identifier: 'account-link-email:user-1:user@test.com',
      token: 'link-token',
      expires: new Date('2026-06-14T10:00:00.000Z'),
    })
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
  })

  it('возвращает 401 без сессии', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const res = await POST(makeRequest({ email: 'user@test.com' }))

    expect(res.status).toBe(401)
    expect(createEmailAccountLinkToken).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('создаёт token для текущего user и отправляет письмо со ссылкой привязки', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', name: 'User' } })

    const res = await POST(makeRequest({ email: ' User@Test.com ' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(createEmailAccountLinkToken).toHaveBeenCalledWith('user-1', 'user@test.com', expect.objectContaining({ auditTx: true }))
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@test.com',
      subject: 'Подтвердите почту для профиля',
      html: expect.stringContaining('/api/account/identities/email/callback'),
      text: expect.stringContaining('/api/account/identities/email/callback'),
    }))
  })
})

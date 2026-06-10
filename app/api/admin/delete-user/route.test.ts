/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as dbModule from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn((jest.requireMock('@/lib/db') as { db: unknown }).db),
}))

const mockAuth = authModule.auth as jest.Mock
const mockSelect = dbModule.db.select as jest.Mock
const mockDelete = dbModule.db.delete as jest.Mock
const UUID = '123e4567-e89b-42d3-a456-426614174000'

beforeEach(() => {
  jest.clearAllMocks()
  mockSelect.mockReturnValue({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([{ contactEmail: 'user@test.com' }]),
  })
})

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/delete-user', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DELETE /api/admin/delete-user — security', () => {
  it('[SEC] возвращает 403 при isAdmin=undefined', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    const res = await DELETE(makeRequest({ userId: UUID }))
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('[SEC] возвращает 403 при isAdmin=null', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: null } })
    const res = await DELETE(makeRequest({ userId: UUID }))
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('[SEC] не-админ не может удалить чужой аккаунт', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
    const res = await DELETE(makeRequest({ userId: UUID }))
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('[SEC] NEXTAUTH_TEST_MODE не обходит проверку isAdmin', async () => {
    const original = process.env.NEXTAUTH_TEST_MODE
    process.env.NEXTAUTH_TEST_MODE = 'true'
    try {
      mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
      const res = await DELETE(makeRequest({ userId: UUID }))
      expect(res.status).toBe(403)
    } finally {
      process.env.NEXTAUTH_TEST_MODE = original
    }
  })
})

describe('DELETE /api/admin/delete-user', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(makeRequest({ userId: UUID }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии userId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('принимает legacy id, который уже пришёл из DB-списка пользователей', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: 'test:user@test.com' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('возвращает 200 и удаляет пользователя из DB', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: UUID }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('чистит notification_queue по contact_email перед удалением пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: UUID }))

    expect(res.status).toBe(200)
    expect(mockSelect).toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledTimes(2)
  })
})

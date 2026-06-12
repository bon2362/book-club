/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as mergeModule from '@/lib/admin/user-merge'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ tx: true })),
}))
jest.mock('@/lib/admin/user-merge', () => {
  class IdentityConflictError extends Error {}
  class MergeValidationError extends Error {}
  class MissingMergeUserError extends Error {}
  return {
    IdentityConflictError,
    MergeValidationError,
    MissingMergeUserError,
    validateMergeRequest: jest.fn(input => input),
    mergeUsers: jest.fn(),
  }
})

const mockAuth = authModule.auth as jest.Mock
const validateMergeRequest = mergeModule.validateMergeRequest as jest.Mock
const mergeUsers = mergeModule.mergeUsers as jest.Mock

function makeRequest(body: object | string) {
  return new NextRequest('http://localhost/api/admin/users/merge', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/admin/users/merge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    validateMergeRequest.mockImplementation(input => ({
      sourceUserId: String(input.sourceUserId),
      targetUserId: String(input.targetUserId),
      reason: String(input.reason),
      currentAdminUserId: input.currentAdminUserId,
    }))
    mergeUsers.mockResolvedValue({ sourceUserId: 'source', targetUserId: 'target', movedCounts: { users: 1 } })
  })

  it('возвращает 403 без admin session', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })

    const res = await POST(makeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: 'дубль' }))

    expect(res.status).toBe(403)
    expect(mergeUsers).not.toHaveBeenCalled()
  })

  it('возвращает 400 на invalid JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })

    const res = await POST(makeRequest('{bad json'))

    expect(res.status).toBe(400)
    expect(mergeUsers).not.toHaveBeenCalled()
  })

  it('прокидывает admin id в validation и merge', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', name: 'Admin', contactEmail: 'admin@test.com', isAdmin: true } })

    const res = await POST(makeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: 'дубль' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(validateMergeRequest).toHaveBeenCalledWith(expect.objectContaining({
      sourceUserId: 'source',
      targetUserId: 'target',
      reason: 'дубль',
      currentAdminUserId: 'admin',
    }))
    expect(mergeUsers).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({
      sourceUserId: 'source',
      targetUserId: 'target',
      actorUserId: 'admin',
    }))
  })

  it('возвращает 400 для validation errors', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    validateMergeRequest.mockImplementation(() => {
      throw new mergeModule.MergeValidationError('reason required')
    })

    const res = await POST(makeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: '' }))

    expect(res.status).toBe(400)
  })

  it('возвращает 404 если source или target не найден', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    mergeUsers.mockRejectedValue(new mergeModule.MissingMergeUserError('target user not found'))

    const res = await POST(makeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: 'дубль' }))

    expect(res.status).toBe(404)
  })

  it('возвращает 409 на конфликт identity', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } })
    mergeUsers.mockRejectedValue(new mergeModule.IdentityConflictError('identity belongs to another user'))

    const res = await POST(makeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: 'дубль' }))

    expect(res.status).toBe(409)
  })
})

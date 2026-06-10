/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))

interface UpdateCall { id: string; sortOrder: number }
const updateCalls: UpdateCall[] = []

jest.mock('@/lib/db', () => {
  return {
    db: {
      update: jest.fn(() => ({
        set: jest.fn((patch: { sortOrder?: number }) => ({
          where: jest.fn((cond: { __id?: string }) => {
            const id = cond?.__id ?? 'unknown'
            const sortOrder = typeof patch.sortOrder === 'number' ? patch.sortOrder : -1
            updateCalls.push({ id, sortOrder })
            return Promise.resolve(undefined)
          }),
        })),
      })),
    },
  }
})

// drizzle's `eq(books.id, value)` returns an opaque object — we attach the value so the
// mock above can read which id was targeted.
jest.mock('drizzle-orm', () => ({
  eq: (_col: unknown, value: string) => ({ __id: value }),
}))

import { PUT } from './route'

const mockAuth = authModule.auth as jest.Mock

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/books/reorder', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  updateCalls.length = 0
  mockAuth.mockReset()
})

describe('PUT /api/admin/books/reorder', () => {
  it('returns 403 without an admin session', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PUT(makeReq({ ids: ['a'] }))
    expect(res.status).toBe(403)
    expect(updateCalls.length).toBe(0)
  })

  it('returns 403 without any session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makeReq({ ids: ['a'] }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when body is not valid JSON', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const req = new NextRequest('http://localhost/api/admin/books/reorder', {
      method: 'PUT',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is missing', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is empty', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(makeReq({ ids: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids contains a non-string', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(makeReq({ ids: ['ok', 7] }))
    expect(res.status).toBe(400)
  })

  it('writes 1-based sort_order to each id sequentially', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(makeReq({ ids: ['c', 'a', 'b'] }))
    expect(res.status).toBe(200)
    expect(updateCalls).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 3 },
    ])
  })
})

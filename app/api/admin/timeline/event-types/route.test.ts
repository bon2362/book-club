/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const selectQueue: unknown[][] = []
function pushSelect(rows: unknown[]) { selectQueue.push(rows) }

jest.mock('@/lib/db', () => {
  function buildChain() {
    const chain = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      groupBy: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      leftJoin: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return { db: { select: jest.fn(() => buildChain()) }, sql: jest.fn() }
})

const insertValues = jest.fn().mockResolvedValue(undefined)
const updateWhere = jest.fn().mockResolvedValue(undefined)
const updateSet = jest.fn(() => ({ where: updateWhere }))
const deleteWhere = jest.fn().mockResolvedValue(undefined)
const tx = {
  insert: jest.fn(() => ({ values: insertValues })),
  update: jest.fn(() => ({ set: updateSet })),
  delete: jest.fn(() => ({ where: deleteWhere })),
}
const withAuditContextMock = jest.fn(
  (_ctx: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx),
)
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (...args: unknown[]) =>
    (withAuditContextMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

import { GET, POST } from './route'
import { PATCH, DELETE } from './[id]/route'

const mockAuth = authModule.auth as jest.Mock
const admin = { user: { id: 'admin-1', isAdmin: true, name: 'Админ', contactEmail: 'a@b.c' } }

function makeRequest(body: unknown, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/timeline/event-types', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  selectQueue.length = 0
  insertValues.mockClear()
  updateSet.mockClear()
  deleteWhere.mockClear()
  withAuditContextMock.mockClear()
})

describe('GET /api/admin/timeline/event-types', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await GET()).status).toBe(403)
  })

  it('403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
  })

  it('отдаёт типы со счётчиком использования', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 't1', title: 'Война', color: '#C0603A', icon: '⚔', usageCount: 3 }])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data[0].usageCount).toBe(3)
  })
})

describe('POST /api/admin/timeline/event-types', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await POST(makeRequest({ title: 'Война', color: '#C0603A', icon: '⚔' }))
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('400 при неверном цвете', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest({ title: 'Война', color: 'red', icon: '⚔' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/#RRGGBB/)
  })

  it('создаёт тип через withAuditContext с source=admin', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest({ title: 'Война', color: '#C0603A', icon: '⚔' }))
    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledTimes(1)
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string; actorUserId: string }
    expect(ctx.source).toBe('admin')
    expect(ctx.actorUserId).toBe('admin-1')
  })

  it('409 при повторе названия', async () => {
    mockAuth.mockResolvedValue(admin)
    insertValues.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    const res = await POST(makeRequest({ title: 'Война', color: '#C0603A', icon: '⚔' }))
    expect(res.status).toBe(409)
  })
})

describe('PATCH /api/admin/timeline/event-types/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makeRequest({ title: 'X', color: '#C0603A', icon: '⚔' }, 'PATCH'), {
      params: { id: 't1' },
    })
    expect(res.status).toBe(403)
  })

  it('404 если типа нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await PATCH(makeRequest({ title: 'X', color: '#C0603A', icon: '⚔' }, 'PATCH'), {
      params: { id: 't1' },
    })
    expect(res.status).toBe(404)
  })

  it('обновляет существующий тип', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 't1' }])
    const res = await PATCH(makeRequest({ title: 'Мир', color: '#2D6A4F', icon: '☮' }, 'PATCH'), {
      params: { id: 't1' },
    })
    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/admin/timeline/event-types/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 't1' } })
    expect(res.status).toBe(403)
  })

  it('409 если тип используется событиями', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ count: 2 }])
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 't1' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('2 событиях')
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  it('409 с падежом «событии» для одного события', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ count: 1 }])
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 't1' } })
    expect((await res.json()).error).toContain('1 событии')
  })

  it('удаляет неиспользуемый тип', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ count: 0 }])
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 't1' } })
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
  })
})

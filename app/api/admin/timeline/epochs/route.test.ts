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
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
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

const validEpoch = {
  title: 'Античность',
  start: { year: 800, era: 'BCE' },
  end: { year: 476, era: 'CE' },
}

function makeRequest(body: unknown, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/timeline/epochs', {
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

describe('GET /api/admin/timeline/epochs', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await GET()).status).toBe(403)
  })

  it('отдаёт эпохи', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'ep1', title: 'Античность' }])
    const json = await (await GET()).json()
    expect(json.data).toHaveLength(1)
  })
})

describe('POST /api/admin/timeline/epochs', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await POST(makeRequest(validEpoch))).status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('400 у эпохи без окончания', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest({ title: 'Античность', start: { year: 800, era: 'BCE' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/обязательна дата окончания/i)
  })

  it('создаёт эпоху через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest(validEpoch))
    expect(res.status).toBe(200)
    const values = insertValues.mock.calls[0][0] as Record<string, unknown>
    expect(values.startEra).toBe('BCE')
    expect(values.endYear).toBe(476)
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string }
    expect(ctx.source).toBe('admin')
  })
})

describe('PATCH и DELETE /api/admin/timeline/epochs/[id]', () => {
  it('PATCH 403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makeRequest(validEpoch, 'PATCH'), { params: { id: 'ep1' } })
    expect(res.status).toBe(403)
  })

  it('PATCH 404 если эпохи нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await PATCH(makeRequest(validEpoch, 'PATCH'), { params: { id: 'ep1' } })
    expect(res.status).toBe(404)
  })

  it('PATCH обновляет эпоху', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'ep1' }])
    const res = await PATCH(makeRequest(validEpoch, 'PATCH'), { params: { id: 'ep1' } })
    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledTimes(1)
  })

  it('DELETE 403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 'ep1' } })
    expect(res.status).toBe(403)
  })

  it('DELETE удаляет эпоху', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 'ep1' } })
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
  })
})

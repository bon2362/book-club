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

const validEvent = {
  title: 'Октябрьская революция',
  eventTypeId: 't1',
  start: { year: 1917, era: 'CE', month: 11, day: 7 },
}

function makeRequest(body: unknown, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/timeline/events', {
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

describe('GET /api/admin/timeline/events', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await GET()).status).toBe(403)
  })

  it('отдаёт события с данными типа', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'e1', title: 'Событие', typeTitle: 'Война', typeColor: '#C0603A' }])
    const json = await (await GET()).json()
    expect(json.data[0].typeTitle).toBe('Война')
  })
})

describe('POST /api/admin/timeline/events', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await POST(makeRequest(validEvent))).status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('создаёт событие через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 't1' }])
    const res = await POST(makeRequest(validEvent))
    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledTimes(1)
    const values = insertValues.mock.calls[0][0] as Record<string, unknown>
    expect(values.startYear).toBe(1917)
    expect(values.startEra).toBe('CE')
    expect(values.endYear).toBeNull()
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string }
    expect(ctx.source).toBe('admin')
  })

  it('400 когда «продолжается» задано вместе с окончанием', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(
      makeRequest({ ...validEvent, ongoing: true, end: { year: 1920, era: 'CE' } }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/продолжается/i)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('400 когда окончание раньше начала в BCE', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(
      makeRequest({
        ...validEvent,
        start: { year: 50, era: 'BCE' },
        end: { year: 100, era: 'BCE' },
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/раньше даты начала/i)
  })

  it('400 когда тип не существует', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await POST(makeRequest(validEvent))
    expect(res.status).toBe(400)
    expect(insertValues).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/timeline/events/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makeRequest(validEvent, 'PATCH'), { params: { id: 'e1' } })
    expect(res.status).toBe(403)
  })

  it('404 если события нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await PATCH(makeRequest(validEvent, 'PATCH'), { params: { id: 'e1' } })
    expect(res.status).toBe(404)
  })

  it('обновляет событие', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'e1' }])
    pushSelect([{ id: 't1' }])
    const res = await PATCH(makeRequest(validEvent, 'PATCH'), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/admin/timeline/events/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 'e1' } })
    expect(res.status).toBe(403)
  })

  it('удаляет событие через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await DELETE(makeRequest({}, 'DELETE'), { params: { id: 'e1' } })
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
    expect(withAuditContextMock).toHaveBeenCalledTimes(1)
  })
})

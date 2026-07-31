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
      limit: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return { db: { select: jest.fn(() => buildChain()) }, sql: jest.fn() }
})

const fetchTimelineSummariesMock = jest.fn()
jest.mock('@/lib/timeline/queries', () => ({
  fetchTimelineSummaries: (...args: unknown[]) => fetchTimelineSummariesMock(...args),
}))

const updateWhere = jest.fn().mockResolvedValue(undefined)
const updateSet = jest.fn(() => ({ where: updateWhere }))
const tx = { update: jest.fn(() => ({ set: updateSet })) }
const withAuditContextMock = jest.fn(
  (_ctx: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx),
)
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (...args: unknown[]) =>
    (withAuditContextMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

import { GET } from './route'
import { PATCH } from './[id]/route'

const mockAuth = authModule.auth as jest.Mock
const admin = { user: { id: 'admin-1', isAdmin: true, name: 'Админ', contactEmail: 'a@b.c' } }

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/timeline/timelines/tl1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  selectQueue.length = 0
  updateSet.mockClear()
  withAuditContextMock.mockClear()
  fetchTimelineSummariesMock.mockReset()
})

describe('GET /api/admin/timeline/timelines', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    expect((await GET()).status).toBe(403)
    expect(fetchTimelineSummariesMock).not.toHaveBeenCalled()
  })

  it('запрашивает и черновики', async () => {
    mockAuth.mockResolvedValue(admin)
    fetchTimelineSummariesMock.mockResolvedValue([{ id: 'tl1', published: false }])
    const json = await (await GET()).json()
    expect(fetchTimelineSummariesMock).toHaveBeenCalledWith({ includeUnpublished: true })
    expect(json.data[0].published).toBe(false)
  })
})

describe('PATCH /api/admin/timeline/timelines/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makeRequest({ published: true }), { params: { id: 'tl1' } })
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('400 при постороннем поле', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await PATCH(makeRequest({ published: true, title: 'Новое' }), {
      params: { id: 'tl1' },
    })
    expect(res.status).toBe(400)
  })

  it('404 если ленты нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await PATCH(makeRequest({ published: true }), { params: { id: 'tl1' } })
    expect(res.status).toBe(404)
  })

  it('снимает публикацию через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    const res = await PATCH(makeRequest({ published: false }), { params: { id: 'tl1' } })
    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ published: false }))
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string; reason: string }
    expect(ctx.source).toBe('admin')
    expect(ctx.reason).toMatch(/снятие/i)
  })
})

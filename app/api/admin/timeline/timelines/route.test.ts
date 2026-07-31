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
      innerJoin: jest.fn(() => chain),
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

const fetchTimelineSummariesMock = jest.fn()
jest.mock('@/lib/timeline/queries', () => ({
  fetchTimelineSummaries: (...args: unknown[]) => fetchTimelineSummariesMock(...args),
}))

const updateWhere = jest.fn().mockResolvedValue(undefined)
const updateSet = jest.fn(() => ({ where: updateWhere }))
const deleteWhere = jest.fn().mockResolvedValue(undefined)
const insertValues = jest.fn().mockResolvedValue(undefined)
const tx = {
  update: jest.fn(() => ({ set: updateSet })),
  delete: jest.fn(() => ({ where: deleteWhere })),
  insert: jest.fn(() => ({ values: insertValues })),
}
const withAuditContextMock = jest.fn(
  (_ctx: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx),
)
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (...args: unknown[]) =>
    (withAuditContextMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

import { GET, POST } from './route'
import { DELETE, PATCH } from './[id]/route'
import { GET as CONTENTS } from './[id]/contents/route'

const mockAuth = authModule.auth as jest.Mock
const admin = { user: { id: 'admin-1', isAdmin: true, name: 'Админ', contactEmail: 'a@b.c' } }

const URL = 'http://localhost/api/admin/timeline/timelines/tl1'

function makeRequest(body: unknown, method = 'PATCH') {
  return new NextRequest(URL, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** GET и DELETE не несут тела — Request их с телом не принимает. */
function makeBodylessRequest(method: 'GET' | 'DELETE') {
  return new NextRequest(URL, { method })
}

/** Postgres-ошибка нарушения уникального индекса на slug. */
const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })

beforeEach(() => {
  selectQueue.length = 0
  updateSet.mockClear()
  deleteWhere.mockClear()
  insertValues.mockClear().mockResolvedValue(undefined)
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

describe('POST /api/admin/timeline/timelines', () => {
  const body = { title: 'Моя лента', slug: 'moya-lenta', description: '' }

  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await POST(makeRequest(body, 'POST'))
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('400 при недопустимом адресе', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest({ ...body, slug: 'Моя Лента' }, 'POST'))
    expect(res.status).toBe(400)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('создаёт черновик через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await POST(makeRequest(body, 'POST'))
    expect(res.status).toBe(200)
    expect((await res.json()).data.published).toBe(false)
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ slug: 'moya-lenta' }))
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string; actorUserId: string }
    expect(ctx.source).toBe('admin')
    expect(ctx.actorUserId).toBe('admin-1')
  })

  it('409 при занятом адресе, а не 500 от базы', async () => {
    mockAuth.mockResolvedValue(admin)
    insertValues.mockRejectedValueOnce(uniqueViolation)
    const res = await POST(makeRequest(body, 'POST'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('moya-lenta')
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
    const res = await PATCH(makeRequest({ published: true, lane: 2 }), { params: { id: 'tl1' } })
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

  it('меняет название и адрес', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    const res = await PATCH(makeRequest({ title: 'Новое', slug: 'novoe' }), {
      params: { id: 'tl1' },
    })
    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новое', slug: 'novoe' }),
    )
  })

  it('409 при смене адреса на занятый', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    updateWhere.mockRejectedValueOnce(uniqueViolation)
    const res = await PATCH(makeRequest({ slug: 'zanyato' }), { params: { id: 'tl1' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('zanyato')
  })
})

describe('DELETE /api/admin/timeline/timelines/[id]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeBodylessRequest('DELETE'), { params: { id: 'tl1' } })
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('удаляет ленту через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await DELETE(makeBodylessRequest('DELETE'), { params: { id: 'tl1' } })
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalled()
    const ctx = withAuditContextMock.mock.calls[0][0] as { reason: string }
    expect(ctx.reason).toMatch(/удаление ленты/i)
  })
})

describe('GET /api/admin/timeline/timelines/[id]/contents', () => {
  const event = { id: 'ev1', title: 'Событие' }
  const other = { id: 'ev2', title: 'Другое' }
  const epoch = { id: 'ep1', title: 'Эпоха' }

  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await CONTENTS(makeBodylessRequest('GET'), { params: { id: 'tl1' } })
    expect(res.status).toBe(403)
  })

  it('404 если ленты нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await CONTENTS(makeBodylessRequest('GET'), { params: { id: 'tl1' } })
    expect(res.status).toBe(404)
  })

  it('делит справочники на «в ленте» и «можно добавить»', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1', slug: 'lenta', title: 'Лента', description: '', published: true }])
    pushSelect([event, other])
    pushSelect([epoch])
    pushSelect([{ eventId: 'ev1', note: 'заметка' }])
    pushSelect([{ epochId: 'ep1', note: '', color: '#2D6A4F', visible: true, pinnedLane: 1 }])

    const json = await (await CONTENTS(makeBodylessRequest('GET'), { params: { id: 'tl1' } })).json()

    expect(json.data.events).toEqual([{ ...event, note: 'заметка' }])
    expect(json.data.availableEvents).toEqual([other])
    expect(json.data.epochs[0]).toMatchObject({ id: 'ep1', color: '#2D6A4F', pinnedLane: 1 })
    expect(json.data.availableEpochs).toEqual([])
    expect(json.data.timeline.eventCount).toBe(1)
  })
})

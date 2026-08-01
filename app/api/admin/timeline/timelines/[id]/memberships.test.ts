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

const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
const insertValues = jest.fn(() => ({ onConflictDoUpdate }))
const deleteWhere = jest.fn().mockResolvedValue(undefined)
const updateWhere = jest.fn().mockResolvedValue(undefined)
const updateSet = jest.fn(() => ({ where: updateWhere }))
const tx = {
  insert: jest.fn(() => ({ values: insertValues })),
  delete: jest.fn(() => ({ where: deleteWhere })),
  update: jest.fn(() => ({ set: updateSet })),
}
const withAuditContextMock = jest.fn(
  (_ctx: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx),
)
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (...args: unknown[]) =>
    (withAuditContextMock as unknown as (...a: unknown[]) => unknown)(...args),
}))

import { DELETE as DELETE_EVENT, PATCH as PATCH_EVENT, PUT as PUT_EVENT } from './events/[eventId]/route'
import { DELETE as DELETE_EPOCH, PUT as PUT_EPOCH } from './epochs/[epochId]/route'

const mockAuth = authModule.auth as jest.Mock
const admin = { user: { id: 'admin-1', isAdmin: true, name: 'Админ', contactEmail: 'a@b.c' } }

const URL = 'http://localhost/api/admin/timeline/timelines/tl1/events/ev1'

function makeRequest(body: unknown, method = 'PUT') {
  return new NextRequest(URL, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** DELETE не несёт тела — Request его с телом не принимает. */
function makeBodylessRequest(method: 'DELETE') {
  return new NextRequest(URL, { method })
}

const eventParams = { params: { id: 'tl1', eventId: 'ev1' } }
const epochParams = { params: { id: 'tl1', epochId: 'ep1' } }

/** Эпоха 1900–1950 — та, которую включают. */
const epochRow = {
  id: 'ep1',
  title: 'Новое время',
  startYear: 1900,
  startEra: 'CE',
  startMonth: null,
  startDay: null,
  endYear: 1950,
  endEra: 'CE',
  endMonth: null,
  endDay: null,
}

beforeEach(() => {
  selectQueue.length = 0
  insertValues.mockClear()
  onConflictDoUpdate.mockClear()
  deleteWhere.mockClear()
  updateSet.mockClear()
  updateWhere.mockClear()
  withAuditContextMock.mockClear()
})

describe('PATCH /api/admin/timeline/timelines/[id]/events/[eventId]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })

    const res = await PATCH_EVENT(makeRequest({ visible: false }, 'PATCH'), eventParams)

    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('строго принимает только visible', async () => {
    mockAuth.mockResolvedValue(admin)

    const res = await PATCH_EVENT(makeRequest({ visible: false, note: 'лишнее' }, 'PATCH'), eventParams)

    expect(res.status).toBe(400)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('меняет видимость связи через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)

    const res = await PATCH_EVENT(makeRequest({ visible: false }, 'PATCH'), eventParams)

    expect(res.status).toBe(200)
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ visible: false }))
    expect(updateWhere).toHaveBeenCalled()
    expect(withAuditContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'admin', actorUserId: 'admin-1' }),
      expect.any(Function),
    )
    expect(await res.json()).toMatchObject({ success: true, data: { visible: false } })
  })
})

describe('PUT /api/admin/timeline/timelines/[id]/events/[eventId]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PUT_EVENT(makeRequest({}), eventParams)
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('404 если ленты нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([])
    const res = await PUT_EVENT(makeRequest({}), eventParams)
    expect(res.status).toBe(404)
  })

  it('404 если события нет', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([])
    const res = await PUT_EVENT(makeRequest({}), eventParams)
    expect(res.status).toBe(404)
  })

  it('включает событие через upsert и withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([{ id: 'ev1' }])

    const res = await PUT_EVENT(makeRequest({ note: 'заметка' }), eventParams)

    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ timelineId: 'tl1', eventId: 'ev1', note: 'заметка' }),
    )
    // Идемпотентность: повтор с тем же ключом обновляет заметку, а не падает.
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ note: 'заметка' }) }),
    )
    const ctx = withAuditContextMock.mock.calls[0][0] as { source: string; actorUserId: string }
    expect(ctx.source).toBe('admin')
    expect(ctx.actorUserId).toBe('admin-1')
  })

  it('пустое тело даёт пустую заметку', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([{ id: 'ev1' }])
    const res = await PUT_EVENT(makeRequest({}), eventParams)
    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ note: '' }))
  })
})

describe('DELETE /api/admin/timeline/timelines/[id]/events/[eventId]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE_EVENT(makeBodylessRequest('DELETE'), eventParams)
    expect(res.status).toBe(403)
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('снимает связь через withAuditContext', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await DELETE_EVENT(makeBodylessRequest('DELETE'), eventParams)
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalled()
    const ctx = withAuditContextMock.mock.calls[0][0] as { reason: string }
    expect(ctx.reason).toMatch(/исключение события/i)
  })
})

describe('PUT /api/admin/timeline/timelines/[id]/epochs/[epochId]', () => {
  const body = { color: '#2D6A4F', visible: true }

  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PUT_EPOCH(makeRequest(body), epochParams)
    expect(res.status).toBe(403)
  })

  it('400 при цвете не из семи символов', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await PUT_EPOCH(makeRequest({ ...body, color: '2D6A4F' }), epochParams)
    expect(res.status).toBe(400)
  })

  it('включает эпоху без закреплённой дорожки, не читая соседей', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([epochRow])

    const res = await PUT_EPOCH(makeRequest(body), epochParams)

    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ epochId: 'ep1', color: '#2D6A4F', pinnedLane: null }),
    )
  })

  it('409 при занятой дорожке — с названием мешающей эпохи', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([epochRow])
    // Сосед 1949–1980 пересекается с 1900–1950 на два календарных года.
    pushSelect([
      {
        id: 'ep2',
        title: 'Средневековье',
        startYear: 1949,
        startEra: 'CE',
        startMonth: null,
        startDay: null,
        endYear: 1980,
        endEra: 'CE',
        endMonth: null,
        endDay: null,
        pinnedLane: 1,
      },
    ])

    const res = await PUT_EPOCH(makeRequest({ ...body, pinnedLane: 1 }), epochParams)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('Средневековье')
    expect(withAuditContextMock).not.toHaveBeenCalled()
  })

  it('пересечение ровно в один год дорожку не занимает', async () => {
    mockAuth.mockResolvedValue(admin)
    pushSelect([{ id: 'tl1' }])
    pushSelect([epochRow])
    pushSelect([
      {
        id: 'ep2',
        title: 'Соседняя',
        startYear: 1950,
        startEra: 'CE',
        startMonth: null,
        startDay: null,
        endYear: 1980,
        endEra: 'CE',
        endMonth: null,
        endDay: null,
        pinnedLane: 1,
      },
    ])

    const res = await PUT_EPOCH(makeRequest({ ...body, pinnedLane: 1 }), epochParams)

    expect(res.status).toBe(200)
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ pinnedLane: 1 }))
  })
})

describe('DELETE /api/admin/timeline/timelines/[id]/epochs/[epochId]', () => {
  it('403 без админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE_EPOCH(makeBodylessRequest('DELETE'), epochParams)
    expect(res.status).toBe(403)
  })

  it('снимает связь, оставляя эпоху в справочнике', async () => {
    mockAuth.mockResolvedValue(admin)
    const res = await DELETE_EPOCH(makeBodylessRequest('DELETE'), epochParams)
    expect(res.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalled()
    const ctx = withAuditContextMock.mock.calls[0][0] as { reason: string }
    expect(ctx.reason).toMatch(/исключение эпохи/i)
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'
import { BookValidationError } from '@/lib/books'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const selectChainState = { rows: [] as unknown[] }
function pushSelectResult(rows: unknown[]) { selectChainState.rows = rows }

const updateBookMock = jest.fn()

jest.mock('@/lib/db', () => {
  function buildChain() {
    const chain = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) => Promise.resolve(selectChainState.rows).then(onFulfilled),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return {
    db: { select: jest.fn(() => buildChain()) },
  }
})

jest.mock('@/lib/books', () => {
  const actual = jest.requireActual('@/lib/books')
  return {
    ...actual,
    updateBook: (...args: unknown[]) => updateBookMock(...args),
  }
})

import { PATCH } from './route'

const mockAuth = authModule.auth as jest.Mock

function makePatch(id: string, body: object) {
  return new NextRequest(`http://localhost/api/admin/books/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  selectChainState.rows = []
  updateBookMock.mockReset()
})

describe('PATCH /api/admin/books/[id]', () => {
  it('returns 403 without admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makePatch('b1', { title: 'X' }), { params: { id: 'b1' } })
    expect(res.status).toBe(403)
    expect(updateBookMock).not.toHaveBeenCalled()
  })

  it('returns 400 on BookValidationError', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    updateBookMock.mockRejectedValue(new BookValidationError('invalid visibility: bad'))
    const res = await PATCH(makePatch('b1', { visibility: 'bad' }), { params: { id: 'b1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 when book row missing after update', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    updateBookMock.mockResolvedValue(null)
    pushSelectResult([])
    const res = await PATCH(makePatch('missing', { title: 'X' }), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })

  it('returns 500 on unexpected error', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    updateBookMock.mockRejectedValue(new Error('boom'))
    const res = await PATCH(makePatch('b1', { title: 'X' }), { params: { id: 'b1' } })
    expect(res.status).toBe(500)
  })

  it('returns the row on success', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    updateBookMock.mockResolvedValue({ id: 'b1' })
    pushSelectResult([{ id: 'b1', title: 'T', visibility: 'published' }])
    const res = await PATCH(makePatch('b1', { visibility: 'published' }), { params: { id: 'b1' } })
    expect(res.status).toBe(200)
    expect(updateBookMock).toHaveBeenCalledWith('b1', { visibility: 'published' })
    const json = await res.json()
    expect(json.data.id).toBe('b1')
  })

  it('passes visibility changes through', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    updateBookMock.mockResolvedValue({ id: 'b1' })
    pushSelectResult([{ id: 'b1', visibility: 'hidden' }])
    const res = await PATCH(makePatch('b1', { visibility: 'hidden' }), { params: { id: 'b1' } })
    expect(res.status).toBe(200)
    expect(updateBookMock).toHaveBeenCalledWith('b1', { visibility: 'hidden' })
  })
})

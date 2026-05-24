/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'
import { BookValidationError } from '@/lib/books'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const selectChainState = { rows: [] as unknown[] }
function pushSelectResult(rows: unknown[]) { selectChainState.rows = rows }

const insertValuesMock = jest.fn().mockResolvedValue(undefined)
const createBookMock = jest.fn()

jest.mock('@/lib/db', () => {
  function buildChain() {
    const chain = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      groupBy: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) => Promise.resolve(selectChainState.rows).then(onFulfilled),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return {
    db: {
      select: jest.fn(() => buildChain()),
      insert: jest.fn(() => ({ values: insertValuesMock })),
    },
    sql: jest.fn(),
  }
})

jest.mock('@/lib/books', () => {
  const actual = jest.requireActual('@/lib/books')
  return {
    ...actual,
    createBook: (...args: unknown[]) => createBookMock(...args),
  }
})

import { GET, POST } from './route'

const mockAuth = authModule.auth as jest.Mock

function makePost(body: object) {
  return new NextRequest('http://localhost/api/admin/books', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  selectChainState.rows = []
  createBookMock.mockReset()
  insertValuesMock.mockClear()
})

describe('GET /api/admin/books', () => {
  it('returns 403 without admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns 403 without session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns mapped books with signupCount when admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    // Two select queries in order: books rows, then signup counts by book id.
    // Our mock fixture returns the same rows for each call — simplest path: use empty counts.
    pushSelectResult([{
      id: 'b1', title: 'T', author: 'A', tags: ['x'], type: 'book',
      pages: 100, publishedDate: '', textUrl: '', description: '', coverUrl: null,
      whyRead: null, recommendationLink: null, readingStatus: null,
      visibility: 'published', isNew: false, sortOrder: 0, source: 'admin',
      publishedAt: null, hiddenAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    }])
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data[0]).toMatchObject({ id: 'b1', title: 'T', visibility: 'published' })
    expect(typeof json.data[0].signupCount).toBe('number')
  })
})

describe('POST /api/admin/books', () => {
  it('returns 403 without admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await POST(makePost({ title: 'X' }))
    expect(res.status).toBe(403)
    expect(createBookMock).not.toHaveBeenCalled()
  })

  it('returns 400 when createBook rejects with BookValidationError', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    createBookMock.mockRejectedValue(new BookValidationError('title is required'))
    const res = await POST(makePost({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/title/)
  })

  it('returns 500 on unexpected error', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    createBookMock.mockRejectedValue(new Error('db down'))
    const res = await POST(makePost({ title: 'X' }))
    expect(res.status).toBe(500)
  })

  it('creates book and returns row on success', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    createBookMock.mockResolvedValue({ id: 'new1' })
    pushSelectResult([{ id: 'new1', title: 'New', visibility: 'hidden' }])
    const res = await POST(makePost({ title: 'New', author: 'A' }))
    expect(res.status).toBe(200)
    expect(createBookMock).toHaveBeenCalledWith({ title: 'New', author: 'A' })
    const json = await res.json()
    expect(json.data.id).toBe('new1')
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    update: jest.fn(),
  },
}))

import { POST, DELETE } from './route'

const mockAuth = authModule.auth as jest.Mock

function makePost(body: object) {
  return new NextRequest('http://localhost/api/admin/book-new-flag', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeDelete(bookId?: string) {
  const url = bookId
    ? `http://localhost/api/admin/book-new-flag?bookId=${bookId}`
    : 'http://localhost/api/admin/book-new-flag'
  return new NextRequest(url, { method: 'DELETE' })
}

beforeEach(() => {
  ;(db.update as jest.Mock).mockReturnValue({
    set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
  })
})

describe('POST /api/admin/book-new-flag', () => {
  it('returns 403 without session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makePost({ bookId: 'b1', isNew: true }))
    expect(res.status).toBe(403)
  })
  it('returns 400 on bad body', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await POST(makePost({ bookId: 'b1' }))
    expect(res.status).toBe(400)
  })
  it('updates books.is_new when admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await POST(makePost({ bookId: 'b1', isNew: true }))
    expect(res.status).toBe(200)
    expect(db.update as jest.Mock).toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/book-new-flag', () => {
  it('clears is_new when admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await DELETE(makeDelete('b1'))
    expect(res.status).toBe(200)
  })
  it('returns 400 when bookId missing', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await DELETE(makeDelete())
    expect(res.status).toBe(400)
  })
})

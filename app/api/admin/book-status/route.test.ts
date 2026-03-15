/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST, DELETE } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makePostRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/book-status', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeDeleteRequest(bookId?: string) {
  const url = bookId
    ? `http://localhost/api/admin/book-status?bookId=${encodeURIComponent(bookId)}`
    : 'http://localhost/api/admin/book-status'
  return new NextRequest(url, { method: 'DELETE' })
}

describe('POST /api/admin/book-status', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makePostRequest({ bookId: 'book-1', status: 'reading' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })
    const res = await POST(makePostRequest({ bookId: 'book-1', status: 'reading' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии bookId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ status: 'reading' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при пустом bookId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ bookId: '', status: 'read' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при недопустимом статусе', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ bookId: 'book-1', status: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии status', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ bookId: 'book-1' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 при статусе "reading"', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ bookId: 'book-1', status: 'reading' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('возвращает 200 при статусе "read"', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makePostRequest({ bookId: 'book-2', status: 'read' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })
})

describe('DELETE /api/admin/book-status', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeDeleteRequest('book-1'))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })
    const res = await DELETE(makeDeleteRequest('book-1'))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии bookId в query', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await DELETE(makeDeleteRequest())
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и удаляет статус книги', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await DELETE(makeDeleteRequest('book-1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })
})

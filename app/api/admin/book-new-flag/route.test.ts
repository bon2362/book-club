/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST, DELETE } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(),
    delete: jest.fn(),
  },
}))

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
  const insertChain = {
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
  }
  ;(db.insert as jest.Mock).mockReturnValue(insertChain)
  ;(db.delete as jest.Mock).mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  })
})

describe('POST /api/admin/book-new-flag', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makePost({ bookId: 'book-1', isNew: true }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если isAdmin=false', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await POST(makePost({ bookId: 'book-1', isNew: true }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии bookId', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await POST(makePost({ isNew: true }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если isNew не boolean', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await POST(makePost({ bookId: 'book-1', isNew: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('устанавливает флаг и возвращает 200', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })

    const res = await POST(makePost({ bookId: 'book-1', isNew: true }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(db.insert).toHaveBeenCalled()
  })

  it('работает с isNew=false', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })

    const res = await POST(makePost({ bookId: 'book-1', isNew: false }))
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/book-new-flag', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeDelete('book-1'))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если не админ', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeDelete('book-1'))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 без bookId', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await DELETE(makeDelete())
    expect(res.status).toBe(400)
  })

  it('удаляет флаг и возвращает 200', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })

    const res = await DELETE(makeDelete('book-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(db.delete).toHaveBeenCalled()
  })
})

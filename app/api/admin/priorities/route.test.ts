/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import * as authModule from '@/lib/auth'
import * as signupsModule from '@/lib/signup-books'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-books', () => ({ getAllSignups: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))

const mockAuth = authModule.auth as jest.Mock
const mockGetAllSignups = signupsModule.getAllSignups as jest.Mock

function makeGet(bookId?: string) {
  const url = bookId
    ? `http://localhost/api/admin/priorities?bookId=${encodeURIComponent(bookId)}`
    : 'http://localhost/api/admin/priorities'
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/admin/priorities', () => {
  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET(makeGet('book-a'))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 без параметра bookId', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
  })

  it('возвращает участников с priority=null если не расставляли', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'user-1', name: 'Иван', email: 'a@a.com', contacts: '@ivan', selectedBooks: ['Книга А'], selectedBookIds: ['book-a'], timestamp: '', prioritiesSet: false },
    ])

    const mockSelectPriorities = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(mockSelectPriorities)

    const res = await GET(makeGet('book-a'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users[0].priority).toBeNull()
    expect(data.users[0].prioritiesSet).toBe(false)
  })

  it('возвращает пустой массив если нет записей на книгу', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'user-2', name: 'Мария', email: 'b@b.com', contacts: '@maria', selectedBooks: ['Книга Б'], selectedBookIds: ['book-b'], timestamp: '' },
    ])

    const res = await GET(makeGet('book-a'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users).toHaveLength(0)
  })

  it('возвращает priority из bookPriorities если расставляли', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'user-pg-1', name: 'Пётр', email: 'c@c.com', contacts: '@petr', selectedBooks: ['Книга А', 'Книга Б'], selectedBookIds: ['book-a', 'book-b'], timestamp: '', prioritiesSet: true },
    ])

    const updatedAt = new Date('2026-01-01T00:00:00Z')
    const mockSelectPriorities = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { userId: 'user-pg-1', rank: 2, updatedAt },
      ]),
    }
    ;(db.select as jest.Mock).mockReturnValueOnce(mockSelectPriorities)

    const res = await GET(makeGet('book-a'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users[0].priority).toBe(2)
    expect(data.users[0].prioritiesSet).toBe(true)
    expect(data.users[0].totalBooks).toBe(2)
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import * as authModule from '@/lib/auth'
import * as signupsModule from '@/lib/signups'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ getAllSignups: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))

const mockAuth = authModule.auth as jest.Mock
const mockGetAllSignups = signupsModule.getAllSignups as jest.Mock

function makeGet(book?: string) {
  const url = book
    ? `http://localhost/api/admin/priorities?book=${encodeURIComponent(book)}`
    : 'http://localhost/api/admin/priorities'
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/admin/priorities', () => {
  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET(makeGet('Книга А'))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 без параметра book', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
  })

  it('возвращает участников с priority=null если не расставляли', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'a@a.com', name: 'Иван', email: 'a@a.com', contacts: '@ivan', selectedBooks: ['Книга А'], timestamp: '' },
    ])

    const mockSelectUsers = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { id: 'user-1', email: 'a@a.com', prioritiesSet: false },
      ]),
    }
    const mockSelectPriorities = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(mockSelectUsers)
      .mockReturnValueOnce(mockSelectPriorities)

    const res = await GET(makeGet('Книга А'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users[0].priority).toBeNull()
    expect(data.users[0].prioritiesSet).toBe(false)
  })

  it('возвращает пустой массив если нет записей на книгу', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'b@b.com', name: 'Мария', email: 'b@b.com', contacts: '@maria', selectedBooks: ['Книга Б'], timestamp: '' },
    ])

    const res = await GET(makeGet('Книга А'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users).toHaveLength(0)
  })

  it('возвращает priority из bookPriorities если расставляли', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'c@c.com', name: 'Пётр', email: 'c@c.com', contacts: '@petr', selectedBooks: ['Книга А', 'Книга Б'], timestamp: '' },
    ])

    const updatedAt = new Date('2026-01-01T00:00:00Z')
    const mockSelectUsers = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { id: 'user-pg-1', email: 'c@c.com', prioritiesSet: true },
      ]),
    }
    const mockSelectPriorities = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { userId: 'user-pg-1', rank: 2, updatedAt },
      ]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(mockSelectUsers)
      .mockReturnValueOnce(mockSelectPriorities)

    const res = await GET(makeGet('Книга А'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users[0].priority).toBe(2)
    expect(data.users[0].prioritiesSet).toBe(true)
    expect(data.users[0].totalBooks).toBe(2)
  })
})

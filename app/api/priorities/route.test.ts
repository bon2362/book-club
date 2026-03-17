/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PUT } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makeSelectMock(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  }
  return chain
}

function makeGet(url = 'http://localhost/api/priorities') {
  return new NextRequest(url, { method: 'GET' })
}

function makePut(body: object) {
  return new NextRequest('http://localhost/api/priorities', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('возвращает [] если нет приоритетов', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([]))

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual([])
  })

  it('возвращает приоритеты отсортированные по rank', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const rows = [
      { bookName: 'Книга А', rank: 1 },
      { bookName: 'Книга Б', rank: 2 },
    ]
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock(rows))

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(rows)
  })
})

describe('PUT /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePut({ books: ['Книга А'] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 400 если books не массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ books: 'Книга А' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если books пустой массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ books: [] }))
    expect(res.status).toBe(400)
  })

  it('сохраняет приоритеты и устанавливает prioritiesSet=true', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })

    const mockInsert = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    }
    const mockDelete = {
      where: jest.fn().mockResolvedValue(undefined),
    }
    const mockUpdate = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }
    ;(db.insert as jest.Mock).mockReturnValue(mockInsert)
    ;(db.delete as jest.Mock).mockReturnValue(mockDelete)
    ;(db.update as jest.Mock).mockReturnValue(mockUpdate)

    const res = await PUT(makePut({ books: ['Книга А', 'Книга Б'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(db.insert).toHaveBeenCalled()
    expect(db.update).toHaveBeenCalled()
  })
})

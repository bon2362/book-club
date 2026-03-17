/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signups'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ removeBookFromSignup: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
}))

const mockAuth = authModule.auth as jest.Mock
const mockRemoveBook = signups.removeBookFromSignup as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/remove-book', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  // Default: no DB user found → priority step is skipped
  const defaultChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
  }
  ;(db.select as jest.Mock).mockReturnValue(defaultChain)
  ;(db.delete as jest.Mock).mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
  ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) })
})

describe('DELETE /api/admin/remove-book — security', () => {
  it('[SEC] возвращает 403 при isAdmin=undefined', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] возвращает 403 при isAdmin=null', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: null } })
    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] не-админ не может удалить книгу другого пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
    const res = await DELETE(makeRequest({ userId: 'victim@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
    expect(signups.removeBookFromSignup).not.toHaveBeenCalled()
  })

  it('[SEC] NEXTAUTH_TEST_MODE не обходит проверку isAdmin', async () => {
    const original = process.env.NEXTAUTH_TEST_MODE
    process.env.NEXTAUTH_TEST_MODE = 'true'
    try {
      mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com', isAdmin: false } })
      const res = await DELETE(makeRequest({ userId: 'victim@test.com', bookName: 'Book A' }))
      expect(res.status).toBe(403)
    } finally {
      process.env.NEXTAUTH_TEST_MODE = original
    }
  })
})

describe('DELETE /api/admin/remove-book', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии userId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ bookName: 'Book A' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии bookName', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и вызывает removeBookFromSignup', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.removeBookFromSignup).toHaveBeenCalledWith('user@test.com', 'Book A')
  })
})

describe('DELETE /api/admin/remove-book — priority re-rank', () => {
  it('удаляет приоритет и сдвигает ранги при удалении книги', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    // db.select called twice:
    // 1st: look up user by email → returns pgId
    // 2nd: look up priority rank for this book → returns rank 2
    const selectUserChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ id: 'pg-user-1' }]),
    }
    const selectPriorityChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ rank: 2 }]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectUserChain)
      .mockReturnValueOnce(selectPriorityChain)

    const mockDeleteWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where: mockDeleteWhere })

    const mockUpdateWhere = jest.fn().mockResolvedValue(undefined)
    ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: mockUpdateWhere })

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book B' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)

    // delete priority row
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)

    // re-rank: UPDATE rank = rank - 1 WHERE rank > 2
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1)
  })

  it('пропускает re-rank если пользователь не найден в БД', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    // db.select returns empty (user not in DB)
    const emptyChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    ;(db.select as jest.Mock).mockReturnValueOnce(emptyChain)

    const res = await DELETE(makeRequest({ userId: 'unknown@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(200)
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('пропускает re-rank если нет записи приоритета для книги', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const selectUserChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ id: 'pg-user-1' }]) }
    const selectNoPriorityChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectUserChain)
      .mockReturnValueOnce(selectNoPriorityChain)

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(200)
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})

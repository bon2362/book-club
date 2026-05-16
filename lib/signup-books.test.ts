/**
 * @jest-environment node
 */
import { getAllSignups, removeBookFromSignup, upsertSignup } from './signup-books'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(),
  },
  sql: { transaction: jest.fn() },
}))

describe('signup-books', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('getAllSignups группирует строки signup_books по пользователю', async () => {
    const chain = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          name: 'Иван',
          email: 'ivan@test.com',
          contacts: '@ivan',
          prioritiesSet: true,
          bookName: 'Книга A',
          signedAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          userId: 'user-1',
          name: 'Иван',
          email: 'ivan@test.com',
          contacts: '@ivan',
          prioritiesSet: true,
          bookName: 'Книга B',
          signedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
    }
    ;(db.select as jest.Mock).mockReturnValue(chain)

    const result = await getAllSignups()

    expect(result).toEqual([
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        userId: 'user-1',
        name: 'Иван',
        email: 'ivan@test.com',
        contacts: '@ivan',
        selectedBooks: ['Книга A', 'Книга B'],
        prioritiesSet: true,
      },
    ])
  })

  it('upsertSignup одной транзакцией удаляет старые книги и вставляет новые уникальные', async () => {
    const { sql } = await import('@/lib/db')
    const tx = jest.fn().mockReturnValue('query')
    ;(sql.transaction as jest.Mock).mockImplementation(async (fn) => fn(tx))

    const result = await upsertSignup('user-1', [' Книга A ', 'Книга A', 'Книга B'])

    expect(sql.transaction).toHaveBeenCalled()
    expect(tx).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ isNew: false, addedBooks: ['Книга A', 'Книга B'] })
  })

  it('upsertSignup с пустым списком только очищает записи пользователя', async () => {
    const { sql } = await import('@/lib/db')
    const tx = jest.fn().mockReturnValue('query')
    ;(sql.transaction as jest.Mock).mockImplementation(async (fn) => fn(tx))

    const result = await upsertSignup('user-1', [])

    expect(sql.transaction).toHaveBeenCalled()
    expect(tx).toHaveBeenCalledTimes(1)
    expect(result.addedBooks).toEqual([])
  })

  it('removeBookFromSignup удаляет одну книгу пользователя', async () => {
    const where = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where })

    await removeBookFromSignup('user-1', 'Книга A')

    expect(db.delete).toHaveBeenCalled()
    expect(where).toHaveBeenCalled()
  })
})

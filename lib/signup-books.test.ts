/**
 * @jest-environment node
 */
import { getAllSignups, removeBookFromSignup, upsertSignupByBookIds } from './signup-books'
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
          contactEmail: 'ivan@test.com',
          contacts: '@ivan',
          prioritiesSet: true,
          bookId: 'book-a',
          bookTitle: 'Книга A',
          signedAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          userId: 'user-1',
          name: 'Иван',
          email: 'ivan@test.com',
          contactEmail: 'ivan@test.com',
          contacts: '@ivan',
          prioritiesSet: true,
          bookId: 'book-b',
          bookTitle: 'Книга B',
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
        contactEmail: 'ivan@test.com',
        contacts: '@ivan',
        selectedBooks: ['Книга A', 'Книга B'],
        selectedBookIds: ['book-a', 'book-b'],
        prioritiesSet: true,
      },
    ])
  })

  it('upsertSignupByBookIds одной транзакцией удаляет старые и вставляет новые уникальные', async () => {
    const { sql } = await import('@/lib/db')
    const tx = jest.fn().mockReturnValue('query')
    ;(sql.transaction as jest.Mock).mockImplementation(async (fn) => fn(tx))
    ;(db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { id: 'book-a', title: 'Книга A' },
          { id: 'book-b', title: 'Книга B' },
        ]),
      }),
    })

    const result = await upsertSignupByBookIds('user-1', ['book-a', 'book-a', 'book-b'])

    expect(sql.transaction).toHaveBeenCalled()
    expect(tx).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ isNew: false, addedBooks: ['Книга A', 'Книга B'], addedBookIds: ['book-a', 'book-b'] })
  })

  it('upsertSignupByBookIds с пустым списком только очищает записи пользователя', async () => {
    const { sql } = await import('@/lib/db')
    const tx = jest.fn().mockReturnValue('query')
    ;(sql.transaction as jest.Mock).mockImplementation(async (fn) => fn(tx))

    const result = await upsertSignupByBookIds('user-1', [])

    expect(sql.transaction).toHaveBeenCalled()
    expect(tx).toHaveBeenCalledTimes(1)
    expect(result.addedBooks).toEqual([])
    expect(result.addedBookIds).toEqual([])
  })

  it('upsertSignupByBookIds бросает BOOK_ID_NOT_FOUND если книги нет в каталоге', async () => {
    ;(db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    })

    await expect(upsertSignupByBookIds('user-1', ['missing']))
      .rejects.toThrow('BOOK_ID_NOT_FOUND')
  })

  it('removeBookFromSignup удаляет одну книгу пользователя', async () => {
    const where = jest.fn().mockResolvedValue(undefined)
    ;(db.delete as jest.Mock).mockReturnValue({ where })

    await removeBookFromSignup('user-1', 'book-a')

    expect(db.delete).toHaveBeenCalled()
    expect(where).toHaveBeenCalled()
  })
})

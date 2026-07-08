/**
 * @jest-environment node
 */
import {
  getAllSignups,
  previewSignupByBookIds,
  removeBookFromSignup,
  upsertSignupByBookIds,
} from './signup-books'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
  },
}))

describe('signup-books', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.transaction as jest.Mock).mockImplementation(async (callback) => callback(db))
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
          personalStatus: null,
          personalStatusUpdatedAt: null,
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
          personalStatus: 'reading',
          personalStatusUpdatedAt: new Date('2026-02-15T10:00:00Z'),
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
        signups: [
          {
            bookId: 'book-a',
            personalStatus: null,
            statusUpdatedAt: null,
            signedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            bookId: 'book-b',
            personalStatus: 'reading',
            statusUpdatedAt: '2026-02-15T10:00:00.000Z',
            signedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        prioritiesSet: true,
      },
    ])
  })

  const selectChain = (rows: unknown[]) => ({
    from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }),
  })

  it('upsertSignupByBookIds вычисляет дельту: удаляет ушедшие и вставляет новые уникальные', async () => {
    ;(db.select as jest.Mock)
      // resolveBooksByIds — каталог
      .mockReturnValueOnce(selectChain([
        { id: 'book-a', title: 'Книга A' },
        { id: 'book-b', title: 'Книга B' },
      ]))
      // существующие записи внутри транзакции (было book-a и book-x)
      .mockReturnValueOnce(selectChain([
        { bookId: 'book-a' },
        { bookId: 'book-x' },
      ]))
      // текущие приоритеты — для вычисления следующего auto-ранга
      .mockReturnValueOnce(selectChain([
        { bookId: 'book-a', rank: 1 },
      ]))
      // приоритеты после auto-ранга — для компактизации после удаления book-x
      .mockReturnValueOnce(selectChain([
        { bookId: 'book-a', rank: 1 },
        { bookId: 'book-b', rank: 2 },
      ]))
    ;(db.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    })
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)
    ;(db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    })

    const result = await upsertSignupByBookIds('user-1', ['book-a', 'book-a', 'book-b'])

    expect(db.transaction).toHaveBeenCalled()
    // book-x ушёл из набора (signupBooks) + осиротевший приоритет book-x
    expect(db.delete).toHaveBeenCalledTimes(2)
    expect(insertChain.values).toHaveBeenCalledWith([
      { userId: 'user-1', bookId: 'book-b' }, // только реально новая книга
    ])
    // авто-ранг для новой книги: существующий максимум (book-a, rank 1) + 1
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', bookId: 'book-b', rank: 2, rankSource: 'auto' })
    )
    expect(result).toEqual({
      isNew: false,
      addedBooks: ['Книга A', 'Книга B'],
      addedBookIds: ['book-a', 'book-b'],
      newlyAddedBookIds: ['book-b'],
      removedBookIds: ['book-x'],
    })
  })

  it('previewSignupByBookIds вычисляет ту же дельту без записи вне matching-транзакции', async () => {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([
        { id: 'book-a', title: 'Книга A' },
        { id: 'book-b', title: 'Книга B' },
      ]))
      .mockReturnValueOnce(selectChain([
        { bookId: 'book-a' },
        { bookId: 'book-x' },
      ]))

    const result = await previewSignupByBookIds('user-1', ['book-a', 'book-b'])

    expect(result).toEqual({
      isNew: false,
      addedBooks: ['Книга A', 'Книга B'],
      addedBookIds: ['book-a', 'book-b'],
      newlyAddedBookIds: ['book-b'],
      removedBookIds: ['book-x'],
    })
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('upsertSignupByBookIds с пустым списком удаляет все записи пользователя', async () => {
    // resolveBooksByIds([]) уходит в early-return без select, поэтому первый
    // select — это выборка существующих записей в транзакции.
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([
        { bookId: 'book-a' },
        { bookId: 'book-b' },
      ]))
      // текущие приоритеты — для вычисления следующего auto-ранга (нет toAdd, но select выполняется всегда)
      .mockReturnValueOnce(selectChain([]))
      // приоритеты после удаления — для компактизации (пусто, всё убрано)
      .mockReturnValueOnce(selectChain([]))
    ;(db.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    })

    const result = await upsertSignupByBookIds('user-1', [])

    expect(db.transaction).toHaveBeenCalled()
    // signupBooks delete + осиротевшие приоритеты delete
    expect(db.delete).toHaveBeenCalledTimes(2)
    expect(db.insert).not.toHaveBeenCalled()
    expect(result.addedBooks).toEqual([])
    expect(result.addedBookIds).toEqual([])
    expect(result.newlyAddedBookIds).toEqual([])
    expect(result.removedBookIds).toEqual(['book-a', 'book-b'])
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

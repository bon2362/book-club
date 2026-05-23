/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signup-books'
import * as dbModule from '@/lib/db'
import * as activityModule from '@/lib/user-activity'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-books', () => ({ upsertSignup: jest.fn(), upsertSignupByBookIds: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ catch: jest.fn() }) }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/db/schema', () => ({
  bookPriorities: {},
  notificationQueue: {},
  users: {},
}))
jest.mock('@/lib/user-activity', () => ({
  buildUserActivityDedupeKey: jest.fn(() => 'dedupe-key'),
  bestEffortRecordUserActivity: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockUpsertSignup = signups.upsertSignup as jest.Mock
const mockUpsertSignupByBookIds = signups.upsertSignupByBookIds as jest.Mock
const mockInsert = dbModule.db.insert as jest.Mock
const mockRecordUserActivity = activityModule.bestEffortRecordUserActivity as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function upsertResult(books: string[] = [], bookIds: string[] = books.map((_, i) => `book-${i + 1}`), isNew = false) {
  return { isNew, addedBooks: books, addedBookIds: bookIds }
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBookIds: [] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 401 если в сессии нет user.id', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBookIds: [] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 400 при пустом name', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: '   ', contacts: 'tg', selectedBookIds: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при некорректном contacts', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 123, selectedBookIds: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии selectedBookIds и selectedBooks', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если selectedBookIds не массив', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBookIds: 'Book A' }))
    expect(res.status).toBe(400)
  })

  it('сохраняет запись по bookId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult(['Book A'], ['book-a'], true))

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBookIds: ['book-a'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.upsertSignupByBookIds).toHaveBeenCalledWith('user-1', ['book-a'])
    expect(signups.upsertSignup).not.toHaveBeenCalled()
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'profile_submitted', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'books_selected', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
  })

  it('поддерживает legacy selectedBooks по названиям на переходный период', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue(upsertResult(['Book A'], ['book-a'], true))

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBooks: ['Book A'] }))

    expect(res.status).toBe(200)
    expect(signups.upsertSignup).toHaveBeenCalledWith('user-1', ['Book A'])
  })

  it('обрезает пробелы в name и contacts', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult())

    await POST(makeRequest({ name: '  Test User  ', contacts: '  @test  ', selectedBookIds: [] }))

    expect(signups.upsertSignupByBookIds).toHaveBeenCalledWith('user-1', [])
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'profile_submitted', expect.any(Object))
  })

  it('пишет name и contacts в users', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult())

    await POST(makeRequest({ name: '  Latest Name  ', contacts: '  @latest  ', selectedBookIds: [] }))

    expect(db.update).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ name: 'Latest Name', contacts: '@latest', prioritiesSet: false })
  })

  it('сбрасывает prioritiesSet=false когда selectedBookIds пустой', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult())

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBookIds: [] }))

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      prioritiesSet: false,
    }))
  })

  it('не сбрасывает prioritiesSet если selectedBookIds не пустой', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult(['Книга А'], ['book-a']))

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBookIds: ['book-a'] }))

    expect(mockSet).toHaveBeenCalledWith(expect.not.objectContaining({
      prioritiesSet: expect.anything(),
    }))
  })

  it('удаляет приоритеты для книг, которых нет в новом списке', async () => {
    const { db } = await import('@/lib/db')
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult(['Книга А'], ['book-a']))

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBookIds: ['book-a'] }))

    expect(db.delete).toHaveBeenCalled()
  })

  it('добавляет в очередь уведомлений при добавлении новых книг', async () => {
    const mockValues = jest.fn().mockReturnValue({ catch: jest.fn() })
    mockInsert.mockReturnValue({ values: mockValues })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult(['Книга А', 'Книга Б'], ['book-a', 'book-b'], true))

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBookIds: ['book-a', 'book-b'] }))

    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: 'Test',
        userEmail: 'test@test.com',
        contacts: '@t',
        addedBooks: JSON.stringify(['Книга А', 'Книга Б']),
        isNew: true,
      })
    )
  })

  it('не пишет технический Telegram-only email в очередь уведомлений', async () => {
    const mockValues = jest.fn().mockReturnValue({ catch: jest.fn() })
    mockInsert.mockReturnValue({ values: mockValues })
    mockAuth.mockResolvedValue({ user: { email: 'telegram:123456@telegram.user', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult(['Книга А'], ['book-a'], true))

    await POST(makeRequest({ name: 'Test', contacts: '@telegram', selectedBookIds: ['book-a'] }))

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: '',
        contacts: '@telegram',
      })
    )
  })

  it('не добавляет в очередь если новых книг нет', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult())

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBookIds: ['book-a'] }))

    expect(mockInsert).not.toHaveBeenCalled()
  })
})

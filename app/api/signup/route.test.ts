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
jest.mock('@/lib/signup-books', () => ({ upsertSignup: jest.fn() }))
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
const mockInsert = dbModule.db.insert as jest.Mock
const mockRecordUserActivity = activityModule.bestEffortRecordUserActivity as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/signup', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBooks: [] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 401 если в сессии нет user.id', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBooks: [] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 400 при пустом name', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: '   ', contacts: 'tg', selectedBooks: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при некорректном contacts (не строка)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 123, selectedBooks: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии selectedBooks', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если selectedBooks не массив', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBooks: 'Book A' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 при успешной записи', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: true, addedBooks: ['Book A'] })

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBooks: ['Book A'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.upsertSignup).toHaveBeenCalledWith('user-1', ['Book A'])
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'profile_submitted', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'books_selected', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
  })

  it('обрезает пробелы в name и contacts', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: '  Test User  ', contacts: '  @test  ', selectedBooks: [] }))

    expect(signups.upsertSignup).toHaveBeenCalledWith('user-1', [])
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'profile_submitted', expect.any(Object))
  })

  it('пишет name и contacts в users', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: '  Latest Name  ', contacts: '  @latest  ', selectedBooks: [] }))

    expect(db.update).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ name: 'Latest Name', contacts: '@latest', prioritiesSet: false })
  })

  it('сбрасывает prioritiesSet=false когда selectedBooks пустой', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: [] }))

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      prioritiesSet: false,
    }))
  })

  it('не сбрасывает prioritiesSet если selectedBooks не пустой', async () => {
    const { db } = await import('@/lib/db')
    const mockWhere = jest.fn().mockResolvedValue(undefined)
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere })
    ;(db.update as jest.Mock).mockReturnValue({ set: mockSet })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А'] }))

    expect(mockSet).toHaveBeenCalledWith(expect.not.objectContaining({
      prioritiesSet: expect.anything(),
    }))
  })

  it('удаляет приоритеты для книг, которых нет в новом списке', async () => {
    const { db } = await import('@/lib/db')
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А'] }))

    expect(db.delete).toHaveBeenCalled()
  })

  it('добавляет в очередь уведомлений при добавлении новых книг', async () => {
    const mockValues = jest.fn().mockReturnValue({ catch: jest.fn() })
    mockInsert.mockReturnValue({ values: mockValues })
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: true, addedBooks: ['Книга А', 'Книга Б'] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А', 'Книга Б'] }))

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
    mockUpsertSignup.mockResolvedValue({ isNew: true, addedBooks: ['Книга А'] })

    await POST(makeRequest({ name: 'Test', contacts: '@telegram', selectedBooks: ['Книга А'] }))

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: '',
        contacts: '@telegram',
      })
    )
  })

  it('не добавляет в очередь если новых книг нет', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А'] }))

    expect(mockInsert).not.toHaveBeenCalled()
  })
})

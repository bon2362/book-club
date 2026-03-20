/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signups'
import * as dbModule from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ upsertSignup: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ catch: jest.fn() }) }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/db/schema', () => ({
  bookPriorities: {},
  notificationQueue: {},
}))

const mockAuth = authModule.auth as jest.Mock
const mockUpsertSignup = signups.upsertSignup as jest.Mock
const mockInsert = dbModule.db.insert as jest.Mock

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

  it('возвращает 400 при пустом name', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: '   ', contacts: 'tg', selectedBooks: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при некорректном contacts (не строка)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 123, selectedBooks: [] }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии selectedBooks', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если selectedBooks не массив', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })

    const res = await POST(makeRequest({ name: 'Test', contacts: 'tg', selectedBooks: 'Book A' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 при успешной записи', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })
    mockUpsertSignup.mockResolvedValue({ isNew: true, addedBooks: ['Book A'] })

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBooks: ['Book A'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.upsertSignup).toHaveBeenCalledWith({
      userId: 'test@test.com',
      name: 'Test User',
      email: 'test@test.com',
      contacts: '@test',
      selectedBooks: ['Book A'],
    })
  })

  it('обрезает пробелы в name и contacts', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: '  Test User  ', contacts: '  @test  ', selectedBooks: [] }))

    expect(signups.upsertSignup).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test User', contacts: '@test' })
    )
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

  it('не добавляет в очередь если новых книг нет', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

    await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А'] }))

    expect(mockInsert).not.toHaveBeenCalled()
  })
})

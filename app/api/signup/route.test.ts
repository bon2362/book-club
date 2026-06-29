/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signup-books'
import * as dbModule from '@/lib/db'
import * as activityModule from '@/lib/user-activity'
import {
  broadcastActiveMatchingStateChangeForParticipant,
  getActiveMatchingSessionIdForParticipant,
} from '@/lib/matching/realtime/state-change'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(jest.requireMock('@/lib/db').db),
}))
jest.mock('@/lib/signup-books', () => ({
  previewSignupByBookIds: jest.fn(),
  upsertSignupByBookIds: jest.fn(),
}))
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
jest.mock('@/lib/matching/realtime/state-change', () => ({
  broadcastActiveMatchingStateChangeForParticipant: jest.fn(),
  getActiveMatchingSessionIdForParticipant: jest.fn(),
}))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockUpsertSignupByBookIds = signups.upsertSignupByBookIds as jest.Mock
const mockPreviewSignupByBookIds = signups.previewSignupByBookIds as jest.Mock
const mockInsert = dbModule.db.insert as jest.Mock
const mockRecordUserActivity = activityModule.bestEffortRecordUserActivity as jest.Mock
const mockBroadcastMatchingStateChange = broadcastActiveMatchingStateChangeForParticipant as jest.Mock
const mockGetActiveSessionId = getActiveMatchingSessionIdForParticipant as jest.Mock
const mockRunMatchingTransition = runMatchingTransition as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function upsertResult(
  books: string[] = [],
  bookIds: string[] = books.map((_, i) => `book-${i + 1}`),
  isNew = false,
  newlyAddedBookIds: string[] = bookIds,
  removedBookIds: string[] = [],
) {
  return { isNew, addedBooks: books, addedBookIds: bookIds, newlyAddedBookIds, removedBookIds }
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetActiveSessionId.mockResolvedValue(null)
    mockPreviewSignupByBookIds.mockResolvedValue(upsertResult())
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
    expect(signups.upsertSignupByBookIds).toHaveBeenCalledWith('user-1', ['book-a'], expect.anything())
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'profile_submitted', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'books_selected', expect.objectContaining({
      source: 'api',
      metadata: expect.objectContaining({ selectedBooksCount: 1, addedBooksCount: 1 }),
    }))
    expect(mockBroadcastMatchingStateChange).toHaveBeenCalledWith('user-1')
  })

  it('при активной сессии пишет событие предпочтений с дельтой добавленных/убранных книг', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockGetActiveSessionId.mockResolvedValue('session-1')
    // добавлена book-b, убрана book-x
    mockPreviewSignupByBookIds.mockResolvedValue(
      upsertResult(['Book A', 'Book B'], ['book-a', 'book-b'], false, ['book-b'], ['book-x']),
    )

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBookIds: ['book-a', 'book-b'] }))

    expect(res.status).toBe(200)
    expect(mockRunMatchingTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        actor: expect.objectContaining({ source: 'catalog' }),
        action: {
          type: 'replace_signup',
          userId: 'user-1',
          name: 'Test User',
          contacts: '@test',
          bookIds: ['book-a', 'book-b'],
        },
      }),
    )
    expect(mockUpsertSignupByBookIds).not.toHaveBeenCalled()
  })

  it('не принимает legacy selectedBooks по названиям', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })

    const res = await POST(makeRequest({ name: 'Test User', contacts: '@test', selectedBooks: ['Book A'] }))

    expect(res.status).toBe(400)
    expect(mockUpsertSignupByBookIds).not.toHaveBeenCalled()
  })

  it('обрезает пробелы в name и contacts', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
    mockUpsertSignupByBookIds.mockResolvedValue(upsertResult())

    await POST(makeRequest({ name: '  Test User  ', contacts: '  @test  ', selectedBookIds: [] }))

    expect(signups.upsertSignupByBookIds).toHaveBeenCalledWith('user-1', [], expect.anything())
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

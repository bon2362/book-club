/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))

import { db } from '@/lib/db'
import { buildAdminUserSummaries, getAdminFeedback, getAdminUserDetails, getTelegramDisplay } from './admin-users'

describe('admin-users aggregations', () => {
  const mockSelect = db.select as jest.Mock

  beforeEach(() => {
    mockSelect.mockReset()
  })

  it('считает signup_books по пользователям и парсит языки', () => {
    const users = [
      {
        id: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        contacts: '@anna_contact',
        telegramUsername: 'anna',
        authProvider: 'telegram-preauth',
        lastSignInAt: new Date('2026-01-02T10:00:00Z'),
        lastActivityAt: new Date('2026-01-06T10:00:00Z'),
        emailVerified: new Date('2026-01-01T10:00:00Z'),
        createdAt: new Date('2026-01-01T09:00:00Z'),
        languages: '["ru","en"]',
        isAdmin: true,
      },
      {
        id: 'u2',
        name: null,
        email: 'b@test.com',
        contacts: null,
        telegramUsername: null,
        authProvider: 'google',
        lastSignInAt: null,
        lastActivityAt: null,
        emailVerified: null,
        createdAt: new Date('2026-01-03T10:00:00Z'),
        languages: 'not-json',
        isAdmin: false,
      },
    ]

    const result = buildAdminUserSummaries(users, [
      { userId: 'u1', activityAt: new Date('2026-01-04T10:00:00Z') },
      { userId: 'u1', activityAt: new Date('2026-01-03T10:00:00Z') },
      { userId: 'missing', activityAt: new Date('2026-01-05T10:00:00Z') },
    ])

    expect(result).toEqual([
      expect.objectContaining({
        id: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        languages: ['ru', 'en'],
        booksCount: 2,
        isAdmin: true,
        telegramDisplay: '@anna',
        lastActivityAt: '2026-01-06T10:00:00.000Z',
        createdAt: '2026-01-01T09:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'u2',
        name: '',
        languages: [],
        booksCount: 0,
        isAdmin: false,
        lastActivityAt: null,
        createdAt: '2026-01-03T10:00:00.000Z',
      }),
    ])
  })

  it('использует users.last_activity_at для последней активности', () => {
    const result = buildAdminUserSummaries([
      {
        id: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        contacts: null,
        telegramUsername: null,
        authProvider: 'email',
        lastSignInAt: new Date('2026-01-02T10:00:00Z'),
        lastActivityAt: new Date('2026-01-03T10:00:00Z'),
        emailVerified: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        languages: null,
        isAdmin: false,
      },
    ], [])

    expect(result[0].lastActivityAt).toBe('2026-01-03T10:00:00.000Z')
  })

  it('форматирует Telegram единым formatter-ом', () => {
    expect(getTelegramDisplay({ telegramUsername: 'reader', contacts: '@fallback' })).toBe('@reader')
    expect(getTelegramDisplay({ contacts: '@fallback' })).toBe('@fallback')
    expect(getTelegramDisplay({ contacts: 'email@test.com' })).toBe('')
  })

  it('возвращает null для деталей отсутствующего пользователя', async () => {
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }
    mockSelect.mockReturnValueOnce(query)

    await expect(getAdminUserDetails('missing-user')).resolves.toBeNull()
  })

  it('форматирует фидбеки для админской вкладки', async () => {
    const createdAt = new Date('2026-05-18T10:00:00Z')
    const query = {
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([
        {
          id: 'f1',
          userId: 'u1',
          name: 'Анна',
          email: 'anna@test.com',
          message: 'Спасибо',
          createdAt,
          userName: 'Анна из профиля',
          userEmail: 'profile@test.com',
        },
      ]),
    }
    mockSelect.mockReturnValueOnce(query)

    await expect(getAdminFeedback()).resolves.toEqual([
      {
        id: 'f1',
        userId: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        message: 'Спасибо',
        createdAt: '2026-05-18T10:00:00.000Z',
        userName: 'Анна из профиля',
        userEmail: 'profile@test.com',
      },
    ])
  })
})

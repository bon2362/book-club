/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: {} }))

import { buildAdminUserSummaries, getTelegramDisplay } from './admin-users'

describe('admin-users aggregations', () => {
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
        lastActivityAt: '2026-01-04T10:00:00.000Z',
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

  it('использует last_sign_in_at как активность, если действий ещё нет', () => {
    const result = buildAdminUserSummaries([
      {
        id: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        contacts: null,
        telegramUsername: null,
        authProvider: 'email',
        lastSignInAt: new Date('2026-01-02T10:00:00Z'),
        emailVerified: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        languages: null,
        isAdmin: false,
      },
    ], [])

    expect(result[0].lastActivityAt).toBe('2026-01-02T10:00:00.000Z')
  })

  it('показывает telegram_username раньше contacts', () => {
    expect(getTelegramDisplay({ telegramUsername: 'reader', contacts: '@fallback' })).toBe('@reader')
    expect(getTelegramDisplay({ contacts: '@fallback' })).toBe('@fallback')
    expect(getTelegramDisplay({ contacts: 'email@test.com' })).toBe('email@test.com')
  })
})

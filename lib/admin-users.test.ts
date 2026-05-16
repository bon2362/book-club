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
        languages: '["ru","en"]',
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
        languages: 'not-json',
      },
    ]

    const result = buildAdminUserSummaries(users, [
      { userId: 'u1' },
      { userId: 'u1' },
      { userId: 'missing' },
    ])

    expect(result).toEqual([
      expect.objectContaining({
        id: 'u1',
        name: 'Анна',
        email: 'anna@test.com',
        languages: ['ru', 'en'],
        booksCount: 2,
        lastSignInAt: '2026-01-02T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'u2',
        name: '',
        languages: [],
        booksCount: 0,
        lastSignInAt: null,
      }),
    ])
  })

  it('показывает telegram_username раньше contacts', () => {
    expect(getTelegramDisplay({ telegramUsername: 'reader', contacts: '@fallback' })).toBe('@reader')
    expect(getTelegramDisplay({ contacts: '@fallback' })).toBe('@fallback')
    expect(getTelegramDisplay({ contacts: 'email@test.com' })).toBe('email@test.com')
  })
})

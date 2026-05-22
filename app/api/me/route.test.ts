/**
 * @jest-environment node
 */

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { GET } from './route'

function queueSelects(...rows: unknown[][]) {
  const queue = [...rows]
  ;(db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(queue.shift() ?? []),
  }))
}

describe('GET /api/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает auth fields из последней user_identity, а не из users columns', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
    queueSelects(
      [{
        id: 'user-1',
        name: 'User',
        email: 'user@test.com',
        contacts: '@user',
        telegramUsername: null,
      }],
      [{
        authProvider: 'google',
        lastSignInAt: new Date('2026-01-02T10:00:00Z'),
      }]
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.user).toEqual(expect.objectContaining({
      id: 'user-1',
      authProvider: 'google',
      lastSignInAt: '2026-01-02T10:00:00.000Z',
    }))
  })
})

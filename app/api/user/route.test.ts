/**
 * @jest-environment node
 */
import { DELETE } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/posthog-server', () => ({ deletePostHogPerson: jest.fn().mockResolvedValue(undefined) }))

const mockAuth = authModule.auth as jest.Mock
const { deletePostHogPerson: mockDeletePostHogPerson } = jest.requireMock('@/lib/posthog-server')
const { db } = jest.requireMock('@/lib/db')

beforeEach(() => {
  jest.clearAllMocks()
  db.select.mockReturnValue({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([{ contactEmail: 'user@test.com' }]),
  })
})

describe('DELETE /api/user', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('возвращает 401 без id в сессии', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('возвращает 200 при успешном удалении', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'user@test.com' } })
    const res = await DELETE()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('удаляет пользователя из БД по id', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'user@test.com' } })
    await DELETE()
    expect(db.delete).toHaveBeenCalled()
  })

  it('чистит notification_queue по contact_email перед удалением пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'user@test.com' } })
    await DELETE()
    expect(db.select).toHaveBeenCalled()
    expect(db.delete).toHaveBeenCalledTimes(2)
  })

  it('удаляет профиль из PostHog по тому же id (ZZPL right-to-be-forgotten)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-42', email: 'user@test.com' } })
    await DELETE()
    expect(mockDeletePostHogPerson).toHaveBeenCalledWith('user-42')
  })
})

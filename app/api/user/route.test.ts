/**
 * @jest-environment node
 */
import { DELETE } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/posthog-server', () => ({ deletePostHogPerson: jest.fn().mockResolvedValue(undefined) }))

const mockAuth = authModule.auth as jest.Mock
const { deletePostHogPerson: mockDeletePostHogPerson } = jest.requireMock('@/lib/posthog-server')

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
    const { db } = jest.requireMock('@/lib/db')
    await DELETE()
    expect(db.delete).toHaveBeenCalled()
  })

  it('удаляет профиль из PostHog по тому же id (ZZPL right-to-be-forgotten)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-42', email: 'user@test.com' } })
    await DELETE()
    expect(mockDeletePostHogPerson).toHaveBeenCalledWith('user-42')
  })
})

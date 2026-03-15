/**
 * @jest-environment node
 */
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signups'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ markSignupDeleted: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock
const mockMarkSignupDeleted = signups.markSignupDeleted as jest.Mock

describe('DELETE /api/user', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('возвращает 401 без email в сессии', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('возвращает 200 при успешном удалении', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    mockMarkSignupDeleted.mockResolvedValue(undefined)
    const res = await DELETE()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('вызывает markSignupDeleted с email пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    mockMarkSignupDeleted.mockResolvedValue(undefined)
    await DELETE()
    expect(signups.markSignupDeleted).toHaveBeenCalledWith('user@test.com')
  })

  it('удаляет пользователя из БД', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    mockMarkSignupDeleted.mockResolvedValue(undefined)
    const { db } = jest.requireMock('@/lib/db')
    await DELETE()
    expect(db.delete).toHaveBeenCalled()
  })

  it('выполняет удаление из БД и Sheets параллельно (Promise.all)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'parallel@test.com' } })
    const dbResolved: string[] = []
    const sheetsResolved: string[] = []
    const { db } = jest.requireMock('@/lib/db')
    db.delete.mockReturnValue({
      where: jest.fn().mockImplementation(async () => { dbResolved.push('db') }),
    })
    mockMarkSignupDeleted.mockImplementation(async () => { sheetsResolved.push('sheets') })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(dbResolved).toHaveLength(1)
    expect(sheetsResolved).toHaveLength(1)
  })
})

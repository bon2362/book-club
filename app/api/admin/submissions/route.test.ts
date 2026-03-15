/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([
            { id: 'sub-1', title: 'Сапиенс', author: 'Харари', status: 'pending', userEmail: 'user@test.com' },
          ]),
        }),
      }),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock


describe('GET /api/admin/submissions', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 при isAdmin=undefined', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 200 со списком заявок для админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data[0].title).toBe('Сапиенс')
    expect(data.data[0].userEmail).toBe('user@test.com')
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signups'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ markSignupDeletedByAdmin: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/delete-user', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DELETE /api/admin/delete-user', () => {
  it('возвращает 403 без сессии', async () => {
    jest.spyOn(authModule, 'auth').mockResolvedValue(null as any)

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 без isAdmin', async () => {
    jest.spyOn(authModule, 'auth').mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } } as any)

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии userId', async () => {
    jest.spyOn(authModule, 'auth').mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } } as any)

    const res = await DELETE(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и удаляет пользователя из DB и Sheets', async () => {
    jest.spyOn(authModule, 'auth').mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } } as any)
    jest.spyOn(signups, 'markSignupDeletedByAdmin').mockResolvedValue(undefined)

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.markSignupDeletedByAdmin).toHaveBeenCalledWith('user@test.com')
  })
})

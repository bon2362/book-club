/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'
import * as signups from '@/lib/signups'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ removeBookFromSignup: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockRemoveBook = signups.removeBookFromSignup as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/remove-book', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DELETE /api/admin/remove-book', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии userId', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ bookName: 'Book A' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при отсутствии bookName', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })

    const res = await DELETE(makeRequest({ userId: 'user@test.com' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и вызывает removeBookFromSignup', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockRemoveBook.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(signups.removeBookFromSignup).toHaveBeenCalledWith('user@test.com', 'Book A')
  })
})

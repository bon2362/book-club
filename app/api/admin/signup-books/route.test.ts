/**
 * @jest-environment node
 */
import { PATCH } from './route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), update: jest.fn(), delete: jest.fn(), transaction: jest.fn() } }))

import { auth } from '@/lib/auth'
const mockAuth = auth as jest.Mock

describe('PATCH /api/admin/signup-books', () => {
  it('returns 403 when not admin', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', isAdmin: false } })
    const req = new NextRequest('http://localhost/api/admin/signup-books', {
      method: 'PATCH',
      body: JSON.stringify({ userId: 'u1', bookId: 'b1', status: 'reading' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid status', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin', isAdmin: true } })
    const req = new NextRequest('http://localhost/api/admin/signup-books', {
      method: 'PATCH',
      body: JSON.stringify({ userId: 'u1', bookId: 'b1', status: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})

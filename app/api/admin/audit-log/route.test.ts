/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import { auth } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
        orderBy: () => ({ limit: async () => [] }),
      }),
    }),
  },
}))

const mockedAuth = auth as unknown as jest.Mock

function req(url = 'http://localhost/api/admin/audit-log') {
  return new NextRequest(url)
}

describe('GET /api/admin/audit-log', () => {
  it('rejects non-admins with 403', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: false } })
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns 200 for admins', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
  })
})

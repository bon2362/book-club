/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PUT, POST } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
jest.mock('@/lib/intro', () => ({
  getIntroData: jest.fn().mockResolvedValue({ header: null, sections: [] }),
  updateSections: jest.fn().mockResolvedValue(undefined),
  createSection: jest.fn().mockResolvedValue({ id: 'new', title: '', body: '', sortOrder: 0, isPublished: false }),
}))

const mockAuth = authModule.auth as jest.Mock

function putReq(body: object) {
  return new NextRequest('http://localhost/api/admin/intro', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('admin intro routes', () => {
  it('GET returns 403 without admin', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('GET returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'u@e.com', isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('GET returns intro data for admin', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@e.com', isAdmin: true } })
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('sections')
  })

  it('PUT returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(putReq({ patches: [] }))
    expect(res.status).toBe(403)
  })

  it('PUT returns 400 without patches array', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(putReq({}))
    expect(res.status).toBe(400)
  })

  it('PUT applies patches for admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await PUT(putReq({ patches: [{ id: 'x', title: 't' }] }))
    expect(res.status).toBe(200)
  })

  it('POST returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('POST creates a section for admin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await POST()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.section.id).toBe('new')
  })
})

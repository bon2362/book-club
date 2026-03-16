/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const mockDelete = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: mockDelete,
      }),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/submissions/${id}`, { method: 'DELETE' })
}

describe('DELETE /api/submissions/[id] — auth', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(401)
  })

  it('возвращает 401 при сессии без user.id', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    const res = await DELETE(makeRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/submissions/[id] — ownership', () => {
  it('возвращает 404 если заявка не найдена или принадлежит другому пользователю', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockDelete.mockResolvedValue([])
    const res = await DELETE(makeRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/submissions/[id] — happy path', () => {
  it('удаляет заявку и возвращает 200', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockDelete.mockResolvedValue([{ id: 'sub-1', userId: 'user-1', status: 'pending' }])
    const res = await DELETE(makeRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})

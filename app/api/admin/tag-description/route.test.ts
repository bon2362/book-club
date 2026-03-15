/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/tag-description', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/admin/tag-description', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ tag: 'fiction', description: 'Текст' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })
    const res = await POST(makeRequest({ tag: 'fiction', description: 'Текст' }))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 при отсутствии tag', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makeRequest({ description: 'Текст' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 при пустом tag', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makeRequest({ tag: '', description: 'Текст' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 200 и сохраняет описание тега', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makeRequest({ tag: 'fiction', description: 'Художественная литература' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('возвращает 200 и удаляет описание при пустой description', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makeRequest({ tag: 'fiction', description: '' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('возвращает 200 и удаляет описание при description из пробелов', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const res = await POST(makeRequest({ tag: 'fiction', description: '   ' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('обрезает пробелы в description перед сохранением', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const { db } = jest.requireMock('@/lib/db')

    await POST(makeRequest({ tag: 'poetry', description: '  Поэзия  ' }))

    const valuesCall = db.insert().values.mock.calls.at(-1)?.[0]
    expect(valuesCall?.description).toBe('Поэзия')
  })
})

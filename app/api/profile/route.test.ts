/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PATCH } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const mockSelectResult = jest.fn()
const mockUpdateResult = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectResult,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mockUpdateResult,
        }),
      }),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

describe('GET /api/profile — auth', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('GET /api/profile — happy path', () => {
  it('возвращает null для нового пользователя (колонка null)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSelectResult.mockResolvedValue([{ languages: null }])
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.languages).toBeNull()
  })

  it('возвращает null если пользователь не найден в таблице', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSelectResult.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.languages).toBeNull()
  })

  it('возвращает распарсенный массив языков', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockSelectResult.mockResolvedValue([{ languages: '["ru","en"]' }])
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.languages).toEqual(['ru', 'en'])
  })
})

describe('PATCH /api/profile — auth', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ languages: ['ru'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/profile — happy path', () => {
  it('сохраняет языки и возвращает обновлённый массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockUpdateResult.mockResolvedValue([{ languages: '["ru","en"]' }])
    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ languages: ['ru', 'en'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.languages).toEqual(['ru', 'en'])
  })
})

describe('PATCH /api/profile — validation', () => {
  it('возвращает 400 если languages не массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ languages: 'ru' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid languages')
  })

  it('возвращает 400 если тело запроса невалидный JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid request body')
  })

  it('возвращает 404 если DB не вернула строк', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockUpdateResult.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ languages: ['ru'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('User not found')
  })
})

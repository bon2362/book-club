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
        returning: jest.fn().mockResolvedValue([{
          id: 'test-uuid',
          userId: 'user-1',
          title: 'Test Book',
          author: 'Test Author',
          whyRead: 'It is great',
          topic: null,
          pages: null,
          publishedDate: null,
          textUrl: null,
          description: null,
          coverUrl: null,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        }]),
      }),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/submissions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/submissions — auth', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ title: 'T', author: 'A', whyRead: 'W' }))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('возвращает 401 при сессии без user.id', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    const res = await POST(makeRequest({ title: 'T', author: 'A', whyRead: 'W' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/submissions — validation', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('возвращает 400 без title', async () => {
    const res = await POST(makeRequest({ author: 'A', whyRead: 'W' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/title/)
  })

  it('возвращает 400 без author', async () => {
    const res = await POST(makeRequest({ title: 'T', whyRead: 'W' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/author/)
  })

  it('возвращает 400 без whyRead', async () => {
    const res = await POST(makeRequest({ title: 'T', author: 'A' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/whyRead/)
  })
})

describe('POST /api/submissions — happy path', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('возвращает 201 с валидными данными (все поля)', async () => {
    const res = await POST(makeRequest({
      title: 'Test Book',
      author: 'Test Author',
      whyRead: 'It is great',
      topic: 'Science',
      pages: 300,
      publishedDate: '2020',
      textUrl: 'http://example.com',
      description: 'A great book',
      coverUrl: 'http://example.com/cover.jpg',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.id).toBe('test-uuid')
    expect(data.data.status).toBe('pending')
  })

  it('возвращает 201 только с обязательными полями (остальные null)', async () => {
    const res = await POST(makeRequest({
      title: 'Test Book',
      author: 'Test Author',
      whyRead: 'It is great',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.topic).toBeNull()
    expect(data.data.pages).toBeNull()
    expect(data.data.publishedDate).toBeNull()
    expect(data.data.textUrl).toBeNull()
    expect(data.data.description).toBeNull()
    expect(data.data.coverUrl).toBeNull()
  })
})

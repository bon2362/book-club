/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/feedback — validation', () => {
  it('возвращает 400 при пустом message', async () => {
    const res = await POST(makeRequest({ message: '' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing message')
  })

  it('возвращает 400 при отсутствии message', async () => {
    const res = await POST(makeRequest({ name: 'Иван' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing message')
  })

  it('возвращает 400 при message из пробелов', async () => {
    const res = await POST(makeRequest({ message: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/feedback — happy path', () => {
  beforeEach(() => {
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 200 только с message', async () => {
    const res = await POST(makeRequest({ message: 'Отличный сайт!' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('возвращает 200 со всеми полями', async () => {
    const res = await POST(makeRequest({ message: 'Вопрос', name: 'Иван', email: 'ivan@test.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('вызывает Resend с правильным subject (с именем)', async () => {
    await POST(makeRequest({ message: 'Привет', name: 'Иван' }))
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Обратная связь от Иван',
      to: 'hello@slowreading.club',
      from: 'Долгое наступление <noreply@slowreading.club>',
    }))
  })

  it('вызывает Resend с правильным subject (без имени)', async () => {
    await POST(makeRequest({ message: 'Привет' }))
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Обратная связь',
    }))
  })

  it('включает email и имя в тело письма', async () => {
    await POST(makeRequest({ message: 'Текст', name: 'Иван', email: 'ivan@test.com' }))
    const call = mockSend.mock.calls[0][0]
    expect(call.text).toContain('Иван')
    expect(call.text).toContain('ivan@test.com')
    expect(call.text).toContain('Текст')
  })

  it('показывает "не указано"/"не указан" когда поля пустые', async () => {
    await POST(makeRequest({ message: 'Текст' }))
    const call = mockSend.mock.calls[0][0]
    expect(call.text).toContain('не указано')
    expect(call.text).toContain('не указан')
  })
})

describe('POST /api/feedback — Resend error', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 500 при ошибке Resend', async () => {
    mockSend.mockRejectedValue(new Error('Resend error'))
    const res = await POST(makeRequest({ message: 'Текст' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Failed to send')
  })
})

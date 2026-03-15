/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { PATCH } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const mockSend = jest.fn().mockResolvedValue({ id: 'email-id' })
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

jest.mock('@/lib/email-templates/submission-status', () => ({
  approvedEmail: jest.fn().mockReturnValue({ subject: 'Одобрено', html: '<p>ok</p>' }),
  rejectedEmail: jest.fn().mockReturnValue({ subject: 'Отклонено', html: '<p>no</p>' }),
}))

const mockUpdate = jest.fn()
const mockSelect = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mockUpdate,
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelect,
        }),
      }),
    }),
  },
}))

const mockAuth = authModule.auth as jest.Mock

function makeRequest(id: string, body: object) {
  return new NextRequest(`http://localhost/api/admin/submissions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockSubmission = {
  id: 'sub-1',
  userId: 'user-1',
  title: 'Сапиенс',
  author: 'Харари',
  whyRead: 'Интересно',
  status: 'approved',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('PATCH /api/admin/submissions/[id] — auth', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/submissions/[id] — happy path', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockUpdate.mockResolvedValue([mockSubmission])
    mockSelect.mockResolvedValue([{ email: 'user@test.com' }])
    mockSend.mockResolvedValue({ id: 'email-id' })
  })

  it('возвращает 200 с обновлённой заявкой', async () => {
    const res = await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Сапиенс')
  })

  it('отправляет email при статусе approved', async () => {
    await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@test.com', subject: 'Одобрено' }))
  })

  it('отправляет email при статусе rejected', async () => {
    const rejectedSubmission = { ...mockSubmission, status: 'rejected' }
    mockUpdate.mockResolvedValue([rejectedSubmission])
    await PATCH(makeRequest('sub-1', { status: 'rejected' }), { params: { id: 'sub-1' } })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@test.com', subject: 'Отклонено' }))
  })

  it('возвращает 200 даже если Resend падает', async () => {
    mockSend.mockRejectedValue(new Error('Resend error'))
    const res = await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(res.status).toBe(200)
  })

  it('не отправляет email при обновлении только полей (без смены статуса)', async () => {
    mockSend.mockClear()
    const pendingSubmission = { ...mockSubmission, status: 'pending' }
    mockUpdate.mockResolvedValue([pendingSubmission])
    await PATCH(makeRequest('sub-1', { title: 'Новый заголовок' }), { params: { id: 'sub-1' } })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('возвращает 404 если заявка не найдена', async () => {
    mockUpdate.mockResolvedValue([])
    const res = await PATCH(makeRequest('missing', { status: 'approved' }), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})

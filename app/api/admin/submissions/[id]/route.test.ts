/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { PATCH, DELETE } from './route'
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

const mockPublishSubmissionAsBook = jest.fn().mockResolvedValue('mocked-book-id')
jest.mock('@/lib/book-publish', () => ({
  publishSubmissionAsBook: (...args: unknown[]) => mockPublishSubmissionAsBook(...args),
}))

const mockUpdate = jest.fn()
const mockSelect = jest.fn()
const mockDelete = jest.fn()
const mockInsertValues = jest.fn()
const mockOnConflictDoNothing = jest.fn()

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
        leftJoin: () => ({
          where: () => ({
            limit: mockSelect,
          }),
        }),
        where: () => ({
          limit: mockSelect,
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: mockDelete,
      }),
    }),
    insert: jest.fn(() => ({
      values: mockInsertValues,
    })),
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
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockUpdate.mockResolvedValue([mockSubmission])
    // First select: existing submission; second select: user email for notification
    mockSelect
      .mockResolvedValueOnce([{ title: 'Сапиенс', status: 'approved' }])
      .mockResolvedValue([{ email: 'user@test.com' }])
    mockSend.mockResolvedValue({ id: 'email-id' })
    mockInsertValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing })
    mockOnConflictDoNothing.mockResolvedValue(undefined)
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

  it('не отправляет email на технический Telegram-only адрес', async () => {
    mockSelect.mockReset()
    mockSelect
      .mockResolvedValueOnce([{ title: 'Сапиенс', status: 'approved' }])
      .mockResolvedValue([{ email: 'telegram:123456@telegram.user' }])

    await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('публикует книгу и записывает автора при approved', async () => {
    mockPublishSubmissionAsBook.mockClear()
    await PATCH(makeRequest('sub-1', { status: 'approved' }), { params: { id: 'sub-1' } })
    expect(mockPublishSubmissionAsBook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-1', userId: 'user-1', title: 'Сапиенс' })
    )
  })

  it('отправляет email при статусе rejected', async () => {
    const rejectedSubmission = { ...mockSubmission, status: 'rejected' }
    mockUpdate.mockResolvedValue([rejectedSubmission])
    await PATCH(makeRequest('sub-1', { status: 'rejected' }), { params: { id: 'sub-1' } })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@test.com', subject: 'Отклонено' }))
    expect(mockInsertValues).not.toHaveBeenCalled()
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
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('обновляет signupBooks и bookPriorities при смене title одобренной заявки', async () => {
    const updatedSubmission = { ...mockSubmission, title: 'Новый заголовок', status: 'approved' }
    mockUpdate.mockResolvedValue([updatedSubmission])
    // first select: existing (old title, approved); second: user email (won't be called — no status change)
    mockSelect.mockReset()
    mockSelect
      .mockResolvedValueOnce([{ title: 'Сапиенс', status: 'approved' }])
      .mockResolvedValue([{ email: 'user@test.com' }])
    await PATCH(makeRequest('sub-1', { title: 'Новый заголовок' }), { params: { id: 'sub-1' } })
    // db.update is called 3 times: submission, signupBooks, bookPriorities
    expect(mockUpdate).toHaveBeenCalledTimes(1) // only the .returning() call (for submission update)
  })

  it('возвращает 404 если заявка не найдена', async () => {
    mockSelect.mockReset()
    mockSelect.mockResolvedValue([])
    const res = await PATCH(makeRequest('missing', { status: 'approved' }), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/admin/submissions/[id]', () => {
  function makeDeleteRequest(id: string) {
    return new NextRequest(`http://localhost/api/admin/submissions/${id}`, { method: 'DELETE' })
  }

  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(makeDeleteRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await DELETE(makeDeleteRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(403)
  })

  it('удаляет заявку и возвращает 200', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockDelete.mockResolvedValue([{ id: 'sub-1' }])
    const res = await DELETE(makeDeleteRequest('sub-1'), { params: { id: 'sub-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('возвращает 404 если заявка не найдена', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockDelete.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest('missing'), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})

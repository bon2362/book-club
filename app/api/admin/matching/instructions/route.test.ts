/** @jest-environment node */

import { NextRequest } from 'next/server'
import { GET, PUT } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const getInstructions = jest.fn()
const updateInstructions = jest.fn()
jest.mock('@/lib/matching/instructions', () => ({
  getMatchingInstructions: (...args: unknown[]) => getInstructions(...args),
  updateMatchingInstructions: (...args: unknown[]) => updateInstructions(...args),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_context: unknown, callback: (tx: unknown) => unknown) => callback({}),
}))

const auth = authModule.auth as jest.Mock

describe('/api/admin/matching/instructions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the global instruction to an administrator', async () => {
    auth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    getInstructions.mockResolvedValue({ title: 'Подбор', lead: 'Выберите книги', expandLabel: 'Подробнее', collapseLabel: 'Короче', bodyMarkdown: '- Правило' })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ title: 'Подбор', lead: 'Выберите книги', expandLabel: 'Подробнее', collapseLabel: 'Короче', bodyMarkdown: '- Правило' })
  })

  it('rejects a non-administrator before changing the global instruction', async () => {
    auth.mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })
    const request = new NextRequest('http://localhost/api/admin/matching/instructions', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Подбор' }),
    })

    const response = await PUT(request)

    expect(response.status).toBe(403)
    expect(updateInstructions).not.toHaveBeenCalled()
  })
})

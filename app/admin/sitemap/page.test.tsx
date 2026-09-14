/**
 * @jest-environment node
 */
const mockRedirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

jest.mock('next/navigation', () => ({ redirect: (path: string) => mockRedirect(path) }))
jest.mock('next/link', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/site-routes.generated', () => ({ SITE_ROUTES: ['/', '/admin', '/books/[bookSlug]/summaries'] }))

import { auth } from '@/lib/auth'
import AdminSitemapPage from './page'

describe('/admin/sitemap — доступ', () => {
  it.each([
    ['гость', null],
    ['пользователь без флага админа', { user: { id: 'user-1' } }],
    ['пользователь с isAdmin: false', { user: { id: 'user-1', isAdmin: false } }],
  ])('%s уходит на главную', async (_label, session) => {
    ;(auth as jest.Mock).mockResolvedValue(session)

    await expect(AdminSitemapPage()).rejects.toThrow('NEXT_REDIRECT /')

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('админ видит карту сайта', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })

    await expect(AdminSitemapPage()).resolves.toBeTruthy()

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

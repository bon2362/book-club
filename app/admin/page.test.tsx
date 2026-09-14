/**
 * @jest-environment node
 */
const mockRedirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

jest.mock('next/navigation', () => ({ redirect: (path: string) => mockRedirect(path) }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-books', () => ({ getAllSignups: jest.fn() }))
jest.mock('@/lib/books', () => ({ fetchBooksForAdmin: jest.fn() }))
jest.mock('@/lib/db', () => {
  type Rows = Promise<never[]> & { from: () => Rows; innerJoin: () => Rows }
  const rows = (): Rows => Object.assign(Promise.resolve([] as never[]), { from: rows, innerJoin: rows })
  return { db: { select: jest.fn(rows) } }
})
jest.mock('@/lib/db/schema', () => ({ tagDescriptions: {}, users: {}, bookPriorities: {}, books: {} }))
jest.mock('drizzle-orm', () => ({ eq: jest.fn(), sql: jest.fn() }))
jest.mock('@/components/nd/AdminPanel', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/nd/AdminRefresh', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/nd/AdminFooter', () => ({ __esModule: true, default: () => null }))

import { auth } from '@/lib/auth'
import { getAllSignups } from '@/lib/signup-books'
import { fetchBooksForAdmin } from '@/lib/books'
import AdminPage from './page'

// Права проверяет только сама страница. Без этого теста снятую проверку ловил лишь
// ночной E2E (e2e/admin.spec.ts) — то есть уже после мержа и деплоя.
describe('/admin — доступ', () => {
  beforeEach(() => {
    ;(getAllSignups as jest.Mock).mockResolvedValue([])
    ;(fetchBooksForAdmin as jest.Mock).mockResolvedValue([])
  })

  it.each([
    ['гость', null],
    ['пользователь без флага админа', { user: { id: 'user-1' } }],
    ['пользователь с isAdmin: false', { user: { id: 'user-1', isAdmin: false } }],
  ])('%s уходит на главную и не получает данных админки', async (_label, session) => {
    ;(auth as jest.Mock).mockResolvedValue(session)

    await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT /')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(getAllSignups).not.toHaveBeenCalled()
    expect(fetchBooksForAdmin).not.toHaveBeenCalled()
  })

  it('админ получает страницу с данными', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })

    await expect(AdminPage()).resolves.toBeTruthy()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(getAllSignups).toHaveBeenCalled()
  })
})

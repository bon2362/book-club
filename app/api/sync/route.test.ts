/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as sheets from '@/lib/sheets'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/sheets', () => ({
  invalidateCache: jest.fn(),
  fetchBooks: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockFetchBooks = sheets.fetchBooks as jest.Mock
const mockInvalidateCache = sheets.invalidateCache as jest.Mock

describe('POST /api/sync', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 для не-админа', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com', isAdmin: false } })
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('возвращает 200 с количеством книг', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockFetchBooks.mockResolvedValue([
      { id: '1', name: 'Book A' },
      { id: '2', name: 'Book B' },
    ])
    const res = await POST()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.count).toBe(2)
  })

  it('возвращает count=0 при пустом каталоге', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockFetchBooks.mockResolvedValue([])
    const res = await POST()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.count).toBe(0)
  })

  it('вызывает invalidateCache и fetchBooks(true)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockFetchBooks.mockResolvedValue([])
    await POST()
    expect(mockInvalidateCache).toHaveBeenCalled()
    expect(mockFetchBooks).toHaveBeenCalledWith(true)
  })

  it('вызывает invalidateCache до fetchBooks', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    const callOrder: string[] = []
    mockInvalidateCache.mockImplementation(() => { callOrder.push('invalidate') })
    mockFetchBooks.mockImplementation(async () => { callOrder.push('fetch'); return [] })
    await POST()
    expect(callOrder).toEqual(['invalidate', 'fetch'])
  })

  // Баг: route не имеет try/catch — ошибка Sheets API
  // выбрасывается наружу вместо возврата JSON 500
  it('пробрасывает ошибку при сбое fetchBooks (нет try/catch)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
    mockFetchBooks.mockRejectedValue(new Error('Sheets API error'))
    await expect(POST()).rejects.toThrow('Sheets API error')
  })
})

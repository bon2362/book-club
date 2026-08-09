/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import { ensureScheduleForCurrentCircle } from '@/lib/calendar/schedule-db'

jest.mock('@/lib/calendar/schedule-db', () => ({ ensureScheduleForCurrentCircle: jest.fn() }))
jest.mock('@/lib/calendar/public-state', () => ({
  isMissingCalendarSchemaError: (error: unknown) => (error as { code?: string })?.code === '42P01',
}))

const mockEnsure = ensureScheduleForCurrentCircle as jest.Mock

function request() {
  return new NextRequest('http://localhost/calendar/circle/book-1/1')
}

describe('GET /calendar/circle/[bookId]/[position]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('создаёт пространство и перенаправляет на канонический адрес', async () => {
    mockEnsure.mockResolvedValue({ slug: 'zarya-vsego' })

    const res = await GET(request(), { params: { bookId: 'book-1', position: '1' } })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/calendar/zarya-vsego')
  })

  it('второй круг книги ведёт на свой адрес', async () => {
    mockEnsure.mockResolvedValue({ slug: 'zarya-vsego-2' })

    const res = await GET(request(), { params: { bookId: 'book-1', position: '2' } })

    expect(mockEnsure).toHaveBeenCalledWith({ bookId: 'book-1', position: 2 })
    expect(res.headers.get('location')).toBe('http://localhost/calendar/zarya-vsego-2')
  })

  it('отклоняет нечисловой и нулевой номер круга', async () => {
    expect((await GET(request(), { params: { bookId: 'book-1', position: 'первый' } })).status).toBe(400)
    expect((await GET(request(), { params: { bookId: 'book-1', position: '0' } })).status).toBe(400)
    expect(mockEnsure).not.toHaveBeenCalled()
  })

  it('отвечает 404, если круга с таким номером больше нет', async () => {
    mockEnsure.mockResolvedValue(null)

    const res = await GET(request(), { params: { bookId: 'book-1', position: '1' } })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'circle_not_found' })
  })

  it('до прогона миграции отвечает заглушкой, а не пятисоткой', async () => {
    mockEnsure.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }))

    const res = await GET(request(), { params: { bookId: 'book-1', position: '1' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ migrationRequired: true })
  })
})

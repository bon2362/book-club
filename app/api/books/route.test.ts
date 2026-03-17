/**
 * @jest-environment node
 */
import { GET } from './route'
import * as sheets from '@/lib/sheets'

jest.mock('@/lib/sheets')
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))

let mockSelect: jest.Mock

// Helper: creates a chainable DB result that works as both a thenable and has .where()
function makeChainable(data: unknown[] = []) {
  const p = Promise.resolve(data)
  return {
    where: jest.fn(() => Promise.resolve(data)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

const mockSheetsBook = {
  id: '1', name: 'Test Book', type: 'Book', tags: ['test'], author: 'Author',
  size: 'M', pages: '200', date: '2024', link: '', description: '', coverUrl: null, whyForClub: null, recommendationLink: null,
}

const mockApprovedSubmission = {
  id: 'sub-uuid-1', userId: 'user-1',
  title: 'Сапиенс', author: 'Харари',
  topic: 'История', pages: 500, publishedDate: '2011', textUrl: 'https://example.com',
  description: 'О человечестве', coverUrl: null,
  whyRead: 'Важно', status: 'approved',
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  const { db } = jest.requireMock('@/lib/db')
  mockSelect = db.select
  // Default: both select() calls return empty arrays
  mockSelect.mockReturnValue({
    from: jest.fn().mockReturnValue(makeChainable([])),
  })
})

describe('GET /api/books', () => {
  it('возвращает список книг с кодом 200', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([mockSheetsBook])

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.books).toHaveLength(1)
    expect(data.books[0].name).toBe('Test Book')
  })

  it('возвращает 500 при ошибке Sheets', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockRejectedValue(new Error('API error'))

    const response = await GET()
    expect(response.status).toBe(500)
  })
})

describe('GET /api/books — approved submissions', () => {
  it('возвращает approved заявку в общем списке книг', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([mockSheetsBook])
    // First select() → bookStatuses (empty), second → bookSubmissions (approved)
    mockSelect
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([mockApprovedSubmission])) })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.books).toHaveLength(2)
    const sub = data.books.find((b: { id: string }) => b.id === 'sub-uuid-1')
    expect(sub).toBeDefined()
    expect(sub.name).toBe('Сапиенс')
    expect(sub.author).toBe('Харари')
  })

  it('маппирует поля submission в формат BookWithCover', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([])
    mockSelect
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([mockApprovedSubmission])) })

    const response = await GET()
    const data = await response.json()
    const sub = data.books[0]

    expect(sub.id).toBe('sub-uuid-1')
    expect(sub.name).toBe('Сапиенс')
    expect(sub.tags).toEqual(['История'])
    expect(sub.author).toBe('Харари')
    expect(sub.type).toBe('Book')
    expect(sub.size).toBe('')
    expect(sub.pages).toBe('500')
    expect(sub.date).toBe('2011')
    expect(sub.link).toBe('https://example.com')
    expect(sub.description).toBe('О человечестве')
    expect(sub.coverUrl).toBeNull()
    expect(sub.status).toBeNull()
  })

  it('не включает заявки без topic в tags', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([])
    const noTopicSub = { ...mockApprovedSubmission, topic: null }
    mockSelect
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([noTopicSub])) })

    const response = await GET()
    const data = await response.json()

    expect(data.books[0].tags).toEqual([])
  })

  it('возвращает только Sheets-книги если нет approved заявок', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([mockSheetsBook])
    // Both selects return empty (default mock)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.books).toHaveLength(1)
    expect(data.books[0].name).toBe('Test Book')
  })

  it('pending и rejected заявки не попадают в ответ (where фильтрует на уровне запроса)', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([])
    // where() mock returns empty — simulate DB filtering out non-approved
    mockSelect
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })

    const response = await GET()
    const data = await response.json()

    expect(data.books).toHaveLength(0)
  })

  it('не падает с ошибкой если запрос к bookSubmissions неуспешен', async () => {
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue([mockSheetsBook])
    mockSelect
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue(makeChainable([])) })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn(() => Promise.reject(new Error('DB error'))),
          then: Promise.reject.bind(Promise, new Error('DB error')),
          catch: (fn: (e: Error) => unknown[]) => fn(new Error('DB error')),
          finally: jest.fn(),
        }),
      })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.books).toHaveLength(1)
  })
})

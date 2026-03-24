import { fetchBooksWithCovers } from './books-with-covers'
import * as sheets from '@/lib/sheets'
import { db } from '@/lib/db'
import type { Book } from './sheets'

jest.mock('@/lib/sheets')
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
        catch: jest.fn().mockResolvedValue([]),
        then: jest.fn().mockImplementation((cb: (v: unknown[]) => unknown) => Promise.resolve(cb([]))),
      }),
      catch: jest.fn().mockResolvedValue([]),
    }),
  },
}))

const mockFetchBooks = sheets.fetchBooks as jest.MockedFunction<typeof sheets.fetchBooks>

const sampleBooks: Book[] = [
  {
    id: '2',
    name: 'Кредо либерала',
    author: 'Paul Krugman',
    tags: ['неолиберализм'],
    type: 'Book',
    size: 'L',
    pages: '368',
    date: '1/1/2007',
    link: 'https://example.com',
    description: 'Описание книги',
    coverUrl: 'https://covers.example.com/krugman.jpg',
    whyForClub: null,
    recommendationLink: null,
  },
  {
    id: '3',
    name: 'Как богатые страны стали богатыми',
    author: 'Erik S. Reinert',
    tags: ['модернизация'],
    type: 'Book',
    size: 'L',
    pages: '384',
    date: '2021',
    link: '',
    description: '',
    coverUrl: null,
    whyForClub: null,
    recommendationLink: null,
  },
]

describe('fetchBooksWithCovers', () => {
  it('возвращает книги из fetchBooks', async () => {
    mockFetchBooks.mockResolvedValue(sampleBooks)
    const result = await fetchBooksWithCovers()
    expect(result).toHaveLength(2)
  })

  it('сохраняет coverUrl из данных sheets', async () => {
    mockFetchBooks.mockResolvedValue(sampleBooks)
    const result = await fetchBooksWithCovers()
    // После reverse() книга с id=2 (Krugman) идёт последней
    expect(result[1].coverUrl).toBe('https://covers.example.com/krugman.jpg')
  })

  it('сохраняет null coverUrl когда обложки нет', async () => {
    mockFetchBooks.mockResolvedValue(sampleBooks)
    const result = await fetchBooksWithCovers()
    // После reverse() книга с id=3 (Reinert) идёт первой
    expect(result[0].coverUrl).toBeNull()
  })

  it('сохраняет все поля книги', async () => {
    mockFetchBooks.mockResolvedValue(sampleBooks)
    const result = await fetchBooksWithCovers()
    // После reverse() книга с id=2 (Krugman) идёт последней
    const book = result[1]
    expect(book.id).toBe('2')
    expect(book.name).toBe('Кредо либерала')
    expect(book.author).toBe('Paul Krugman')
    expect(book.tags).toEqual(['неолиберализм'])
    expect(book.type).toBe('Book')
    expect(book.size).toBe('L')
    expect(book.pages).toBe('368')
    expect(book.date).toBe('1/1/2007')
    expect(book.link).toBe('https://example.com')
    expect(book.description).toBe('Описание книги')
  })

  it('возвращает пустой массив когда нет книг', async () => {
    mockFetchBooks.mockResolvedValue([])
    const result = await fetchBooksWithCovers()
    expect(result).toEqual([])
  })

  it('передаёт forceRefresh=true в fetchBooks', async () => {
    mockFetchBooks.mockResolvedValue([])
    await fetchBooksWithCovers(true)
    expect(mockFetchBooks).toHaveBeenCalledWith(true)
  })

  it('передаёт forceRefresh=false по умолчанию', async () => {
    mockFetchBooks.mockResolvedValue([])
    await fetchBooksWithCovers()
    expect(mockFetchBooks).toHaveBeenCalledWith(false)
  })

  it('возвращает новые объекты, не ссылки на оригиналы', async () => {
    mockFetchBooks.mockResolvedValue(sampleBooks)
    const result = await fetchBooksWithCovers()
    // После reverse() result[0] = sampleBooks[1] (Reinert), result[1] = sampleBooks[0] (Krugman)
    expect(result[0]).not.toBe(sampleBooks[1])
    expect(result[0]).toMatchObject(sampleBooks[1])
  })
})

// ── submissionBooks path (lines 36-48) ────────────────────────────────────────

describe('fetchBooksWithCovers — с одобренными заявками', () => {
  const makeSubmission = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    title: 'Поданная книга',
    author: 'Автор подачи',
    topic: 'история',
    pages: 300,
    publishedDate: '2020',
    textUrl: 'https://example.com/book',
    description: 'Подробное описание',
    coverUrl: 'https://example.com/cover.jpg',
    whyRead: 'Важная книга',
    status: 'approved',
    createdAt: new Date('2024-06-01T00:00:00.000Z'),
    ...overrides,
  })

  function mockDbWithSubmissions(
    submissions: unknown[],
    flags: { bookId: string; isNew: boolean }[] = []
  ) {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(submissions),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          catch: jest.fn().mockResolvedValue(flags),
        }),
      })
  }

  beforeEach(() => {
    mockFetchBooks.mockResolvedValue([])
  })

  it('включает одобренные заявки в результат', async () => {
    mockDbWithSubmissions([makeSubmission()])

    const result = await fetchBooksWithCovers()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('sub-1')
    expect(result[0].name).toBe('Поданная книга')
    expect(result[0].author).toBe('Автор подачи')
  })

  it('маппит поля submission корректно', async () => {
    mockDbWithSubmissions([makeSubmission()])

    const result = await fetchBooksWithCovers()
    const book = result[0]

    expect(book.tags).toEqual(['история'])
    expect(book.pages).toBe('300')
    expect(book.date).toBe('2020')
    expect(book.link).toBe('https://example.com/book')
    expect(book.description).toBe('Подробное описание')
    expect(book.coverUrl).toBe('https://example.com/cover.jpg')
    expect(book.whyRead).toBe('Важная книга')
    expect(book.recommendationLink).toBeNull()
    expect(book.type).toBe('Book')
  })

  it('возвращает isNew=true для книги моложе 30 дней', async () => {
    const recentSub = makeSubmission({ createdAt: new Date() })
    mockDbWithSubmissions([recentSub])

    const result = await fetchBooksWithCovers()
    expect(result[0].isNew).toBe(true)
  })

  it('возвращает isNew=false для книги старше 30 дней', async () => {
    const oldSub = makeSubmission({ createdAt: new Date('2020-01-01') })
    mockDbWithSubmissions([oldSub])

    const result = await fetchBooksWithCovers()
    expect(result[0].isNew).toBe(false)
  })

  it('использует явный флаг isNew вместо даты если задан', async () => {
    const oldSub = makeSubmission({ id: 'sub-flagged', createdAt: new Date('2020-01-01') })
    mockDbWithSubmissions([oldSub], [{ bookId: 'sub-flagged', isNew: true }])

    const result = await fetchBooksWithCovers()
    expect(result[0].isNew).toBe(true) // флаг перекрывает дату
  })

  it('возвращает пустой массив tags если topic=null', async () => {
    mockDbWithSubmissions([makeSubmission({ topic: null })])

    const result = await fetchBooksWithCovers()
    expect(result[0].tags).toEqual([])
  })

  it('сортирует заявки по createdAt убывающе', async () => {
    const older = makeSubmission({ id: 'sub-old', createdAt: new Date('2024-01-01') })
    const newer = makeSubmission({ id: 'sub-new', createdAt: new Date('2024-12-01') })
    mockDbWithSubmissions([older, newer])

    const result = await fetchBooksWithCovers()
    expect(result[0].id).toBe('sub-new')
    expect(result[1].id).toBe('sub-old')
  })

  it('устанавливает pages="" если pages=null', async () => {
    mockDbWithSubmissions([makeSubmission({ pages: null })])

    const result = await fetchBooksWithCovers()
    expect(result[0].pages).toBe('')
  })
})

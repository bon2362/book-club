import { fetchBooksWithCovers } from './books-with-covers'
import * as sheets from '@/lib/sheets'
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

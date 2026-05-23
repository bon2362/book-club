/**
 * @jest-environment node
 */
jest.mock('@/lib/books', () => ({
  fetchBooksWithCovers: jest.fn(),
}))
jest.mock('@/lib/db', () => ({ db: {}, sql: jest.fn() }))

import { GET } from './route'
import * as booksLib from '@/lib/books'

const mockBook = {
  id: 'book-uuid-1',
  name: 'Test Book',
  tags: ['test'],
  author: 'Author',
  type: 'Book',
  size: 'M',
  pages: '200',
  date: '2024',
  link: '',
  description: '',
  coverUrl: null,
  whyRead: null,
  recommendationLink: null,
  isNew: false,
  status: null as 'reading' | 'read' | null,
  signupCount: 0,
}

describe('GET /api/books', () => {
  it('returns books with status 200', async () => {
    jest.spyOn(booksLib, 'fetchBooksWithCovers').mockResolvedValue([mockBook])
    const response = await GET()
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.books).toHaveLength(1)
    expect(data.books[0].name).toBe('Test Book')
  })

  it('returns 500 when the catalog read throws', async () => {
    jest.spyOn(booksLib, 'fetchBooksWithCovers').mockRejectedValue(new Error('DB unreachable'))
    const response = await GET()
    expect(response.status).toBe(500)
  })

  it('returns empty array when nothing published', async () => {
    jest.spyOn(booksLib, 'fetchBooksWithCovers').mockResolvedValue([])
    const response = await GET()
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.books).toEqual([])
  })
})

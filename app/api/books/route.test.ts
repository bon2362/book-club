/**
 * @jest-environment node
 */
import { GET } from './route'
import * as sheets from '@/lib/sheets'

jest.mock('@/lib/sheets')

describe('GET /api/books', () => {
  it('возвращает список книг с кодом 200', async () => {
    const mockBooks = [
      { id: '1', name: 'Test Book', type: 'Book', tags: ['test'], author: 'Author',
        size: 'M', pages: '200', date: '2024', link: '', why: '', description: '', coverUrl: null }
    ]
    jest.spyOn(sheets, 'fetchBooks').mockResolvedValue(mockBooks)

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

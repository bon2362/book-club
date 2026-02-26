import { searchBooks } from './search'
import type { Book } from './sheets'

const books: Book[] = [
  { id: '1', name: 'Кредо либерала', author: 'Paul Krugman', tags: ['неолиберализм'],
    type: 'Book', size: 'L', pages: '368', date: '2007', link: '', why: '', description: '', coverUrl: null },
  { id: '2', name: 'Как богатые страны стали богатыми', author: 'Erik S. Reinert', tags: ['модернизация'],
    type: 'Book', size: 'L', pages: '384', date: '2021', link: '', why: '', description: '', coverUrl: null },
  { id: '3', name: 'Democratic Theory', author: 'Grigoriy Yudin', tags: ['демократия'],
    type: 'Book', size: 'M', pages: '200', date: '2022', link: '', why: '', description: '', coverUrl: null },
]

describe('searchBooks', () => {
  it('ищет по точному названию', () => {
    const result = searchBooks(books, 'Кредо')
    expect(result[0].name).toBe('Кредо либерала')
  })

  it('ищет автора на кириллице когда в таблице латиница', () => {
    const result = searchBooks(books, 'Рейнерт')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].author).toContain('Reinert')
  })

  it('ищет автора на латинице когда в таблице кириллица', () => {
    const result = searchBooks(books, 'Yudin')
    expect(result.length).toBeGreaterThan(0)
  })

  it('возвращает все книги при пустом запросе', () => {
    expect(searchBooks(books, '')).toHaveLength(books.length)
  })
})

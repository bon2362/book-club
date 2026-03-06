import { parseBookRow, filterBooks, Book } from './sheets'

// Actual sheet columns: Name(0), Tags(1), Author(2), Type(3), Size(4), Pages(5), Date(6), Link(7), Status(8), ?(9), Description(10), Cover(11)

describe('parseBookRow', () => {
  it('парсит строку таблицы в объект книги', () => {
    const row = [
      'Кредо либерала', 'левые идеи, неолиберализм',
      'Paul Krugman', 'Book', 'L', '368', '1/1/2007',
      'https://example.com', 'Not started', '', 'Описание книги'
    ]
    const book = parseBookRow(row, 0)
    expect(book).toEqual({
      id: '2', name: 'Кредо либерала',
      tags: ['левые идеи', 'неолиберализм'],
      author: 'Paul Krugman', type: 'Book', size: 'L',
      pages: '368', date: '1/1/2007', link: 'https://example.com',
      description: 'Описание книги', coverUrl: null,
    })
  })

  it('возвращает null для строк с пустым названием', () => {
    const row = ['', 'Theme', 'Writer', 'Book', 'L', '368', '1/1/2007', 'Link', '', 'Why', 'Description']
    expect(parseBookRow(row, 0)).toBeNull()
  })

  it('возвращает null для заголовочной строки', () => {
    const row = ['Name', 'Theme', 'Writer', 'Type', 'Size', 'Pages', 'Date', 'Link', 'Status', 'Why', 'Description']
    expect(parseBookRow(row, 0)).toBeNull()
  })
})

describe('filterBooks', () => {
  it('оставляет книги и статьи (Book и Article)', () => {
    const books = [
      { type: 'Book', name: 'A' },
      { type: 'Article', name: 'B' },
      { type: 'Course', name: 'C' },
    ] as Book[]
    expect(filterBooks(books)).toEqual([
      { type: 'Book', name: 'A' },
      { type: 'Article', name: 'B' },
    ])
  })
})

import { parseBookRow, filterBooks, Book } from './sheets'

describe('parseBookRow', () => {
  it('парсит строку таблицы в объект книги', () => {
    const row = [
      '1', 'Кредо либерала', '', 'левые идеи, неолиберализм',
      'Paul Krugman', 'Book', 'L', '368', '1/1/2007',
      'https://example.com', 'to read', 'Замятин посоветовал', 'Описание книги'
    ]
    const book = parseBookRow(row)
    expect(book).toEqual({
      id: '1', name: 'Кредо либерала',
      tags: ['левые идеи', 'неолиберализм'],
      author: 'Paul Krugman', type: 'Book', size: 'L',
      pages: '368', date: '1/1/2007', link: 'https://example.com',
      why: 'Замятин посоветовал', description: 'Описание книги',
    })
  })

  it('возвращает null для строк с пустым названием', () => {
    const row = ['10', 'Name', '', '', '', '', '', '', '', 'Link', '', '', 'Description']
    expect(parseBookRow(row)).toBeNull()
  })
})

describe('filterBooks', () => {
  it('оставляет только книги (Type=Book)', () => {
    const books = [
      { type: 'Book', name: 'A' },
      { type: 'Article', name: 'B' },
      { type: 'Course', name: 'C' },
    ] as Book[]
    expect(filterBooks(books)).toEqual([{ type: 'Book', name: 'A' }])
  })
})

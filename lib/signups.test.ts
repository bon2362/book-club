import { parseSignupRow, buildSignupRow } from './signups'

describe('parseSignupRow', () => {
  it('парсит строку в объект пользователя', () => {
    const row = ['2024-01-01', 'user123', 'Иван', 'ivan@mail.ru', 'tg: @ivan', '["Книга 1","Книга 2"]']
    expect(parseSignupRow(row)).toEqual({
      timestamp: '2024-01-01',
      userId: 'user123',
      name: 'Иван',
      email: 'ivan@mail.ru',
      contacts: 'tg: @ivan',
      selectedBooks: ['Книга 1', 'Книга 2'],
    })
  })

  it('обрабатывает пустой массив книг', () => {
    const row = ['2024-01-01', 'u1', 'Иван', 'i@i.ru', 'tg: @i', '[]']
    expect(parseSignupRow(row).selectedBooks).toEqual([])
  })
})

describe('buildSignupRow', () => {
  it('строит строку для записи в таблицу', () => {
    const row = buildSignupRow({
      userId: 'u1', name: 'Иван', email: 'i@i.ru',
      contacts: 'tg: @i', selectedBooks: ['Книга 1'],
    })
    expect(row[1]).toBe('u1')
    expect(row[2]).toBe('Иван')
    expect(row[3]).toBe('i@i.ru')
    expect(row[4]).toBe('tg: @i')
    expect(JSON.parse(row[5])).toEqual(['Книга 1'])
  })

  it('первый элемент — ISO timestamp', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(new Date(row[0]).toISOString()).toBe(row[0])
  })

  it('возвращает ровно 6 элементов', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(row).toHaveLength(6)
  })

  it('сериализует пустой массив книг в строку "[]"', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: [] })
    expect(row[5]).toBe('[]')
  })

  it('сериализует несколько книг в JSON-массив', () => {
    const row = buildSignupRow({ userId: 'u1', name: 'A', email: 'a@a.com', contacts: 'x', selectedBooks: ['Книга 1', 'Книга 2'] })
    expect(JSON.parse(row[5])).toEqual(['Книга 1', 'Книга 2'])
  })
})

describe('parseSignupRow — краевые случаи', () => {
  it('обрабатывает короткую строку с отсутствующими полями', () => {
    const row = ['2024-01-01']
    const result = parseSignupRow(row)
    expect(result.userId).toBe('')
    expect(result.name).toBe('')
    expect(result.email).toBe('')
    expect(result.contacts).toBe('')
    expect(result.selectedBooks).toEqual([])
  })

  it('обрабатывает пустую строку', () => {
    const result = parseSignupRow([])
    expect(result.timestamp).toBe('')
    expect(result.selectedBooks).toEqual([])
  })
})

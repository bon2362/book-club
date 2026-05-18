import { bookMatchesAuthor, getUniqueAuthors, splitAuthors } from './authors'

describe('authors helpers', () => {
  it('разбивает перечисление авторов через запятую', () => {
    expect(splitAuthors('Автор А, Автор Б')).toEqual(['Автор А', 'Автор Б'])
  })

  it('дедублицирует авторов и не возвращает строку с перечислением', () => {
    const authors = getUniqueAuthors([
      { author: 'Автор А, Автор Б' },
      { author: 'Автор А' },
      { author: ' автор  б ' },
    ])

    expect(authors).toEqual(['Автор А', 'Автор Б'])
    expect(authors).not.toContain('Автор А, Автор Б')
  })

  it('считает книгу совпавшей, если выбран хотя бы один автор из перечисления', () => {
    expect(bookMatchesAuthor({ author: 'Автор А, Автор Б' }, 'Автор Б')).toBe(true)
  })

  it('не добавляет соединитель "и" в список авторов', () => {
    expect(splitAuthors('Автор А и Автор Б')).toEqual(['Автор А', 'Автор Б'])
  })
})

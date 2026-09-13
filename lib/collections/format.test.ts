import {
  collectionIssueText,
  collectionsCount,
  formatChangedAt,
  formatDiffSummary,
  markdownExcerpt,
  textsCount,
} from './format'

describe('склонения', () => {
  it.each([
    [1, '1 текст'],
    [2, '2 текста'],
    [5, '5 текстов'],
    [11, '11 текстов'],
    [21, '21 текст'],
    [22, '22 текста'],
  ])('%i', (n, expected) => {
    expect(textsCount(n)).toBe(expected)
  })

  it('подборки', () => {
    expect(collectionsCount(4)).toBe('4 подборки')
    expect(collectionsCount(5)).toBe('5 подборок')
  })
})

describe('markdownExcerpt', () => {
  it('убирает разметку и обрезает по слову', () => {
    expect(markdownExcerpt('## Заголовок\n\n**текст** [ссылки](https://x.y)', 200)).toBe('Заголовок текст ссылки')
    expect(markdownExcerpt('раз два три четыре', 9)).toBe('раз два…')
  })
})

describe('formatChangedAt', () => {
  const now = new Date(2026, 8, 13, 12)

  it('сегодня, вчера, дни и недели', () => {
    expect(formatChangedAt(new Date(2026, 8, 13, 9), now).relative).toBe('сегодня')
    expect(formatChangedAt(new Date(2026, 8, 12, 9), now).relative).toBe('вчера')
    expect(formatChangedAt(new Date(2026, 8, 10, 9), now)).toEqual({ relative: '3 дня назад', absolute: '10 сентября' })
    expect(formatChangedAt(new Date(2026, 7, 30, 9), now).relative).toBe('2 недели назад')
  })
})

describe('formatDiffSummary', () => {
  it('складывает части через точку', () => {
    expect(formatDiffSummary({ added: 1, removed: 1, textChanged: true, orderChanged: true })).toBe('+1 · −1 · текст · порядок')
    expect(formatDiffSummary({ added: 0, removed: 0, textChanged: false, orderChanged: false })).toBe('')
  })
})

describe('collectionIssueText', () => {
  it('переводит коды и даёт общий текст для неизвестных', () => {
    expect(collectionIssueText('too_few_books')).toBe('Нужно минимум два текста из каталога')
    expect(collectionIssueText('unknown')).toBe('Не удалось сохранить подборку')
  })
})

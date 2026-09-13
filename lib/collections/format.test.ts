import { collectionIssueText, collectionsCount, formatChangedAt, formatDiffSummary, markdownExcerpt, textsCount } from './format'
describe('форматирование подборок', () => {
  it.each([[1, '1 текст'], [2, '2 текста'], [5, '5 текстов'], [11, '11 текстов'], [21, '21 текст']])('склоняет %i', (n, expected) => expect(textsCount(n)).toBe(expected))
  it('очищает markdown и обрезает текст по слову', () => { expect(markdownExcerpt('## Заголовок\n\n**текст** [ссылки](https://x.y)', 200)).toBe('Заголовок текст ссылки'); expect(markdownExcerpt('раз два три четыре', 9)).toBe('раз два…') })
  it('выводит дату и diff', () => { const now = new Date(2026, 8, 13, 12); expect(formatChangedAt(new Date(2026, 8, 10, 9), now)).toEqual({ relative: '3 дня назад', absolute: '10 сентября' }); expect(formatDiffSummary({ added: 1, removed: 1, textChanged: true, orderChanged: true })).toBe('+1 · −1 · текст · порядок'); expect(collectionsCount(5)).toBe('5 подборок') })
  it('объясняет ошибку валидации', () => { expect(collectionIssueText('too_few_books')).toBe('Нужно минимум два текста из каталога'); expect(collectionIssueText('unknown')).toBe('Не удалось сохранить подборку') })
})

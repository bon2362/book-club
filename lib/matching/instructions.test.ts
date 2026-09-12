import {
  DEFAULT_MATCHING_INSTRUCTIONS,
  normalizeMatchingInstructions,
} from './instructions-content'

describe('normalizeMatchingInstructions', () => {
  it('returns trimmed global instructions with Markdown body', () => {
    expect(normalizeMatchingInstructions({
      title: '  Совпадения  ',
      lead: '  Выберите книги  ',
      expandLabel: ' Подробнее ',
      collapseLabel: ' Короче ',
      bodyMarkdown: ' - Первая строка\n- Вторая строка ',
    })).toEqual({
      title: 'Совпадения',
      lead: 'Выберите книги',
      expandLabel: 'Подробнее',
      collapseLabel: 'Короче',
      bodyMarkdown: '- Первая строка\n- Вторая строка',
    })
  })

  it('rejects an empty public field instead of replacing the visible instruction', () => {
    expect(() => normalizeMatchingInstructions({
      ...DEFAULT_MATCHING_INSTRUCTIONS,
      title: '   ',
    })).toThrow('title is required')
  })
})

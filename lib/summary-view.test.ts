import { slugifyAuthor, buildAuthorSlugs, estimateReadingMinutes, selectSummaryIndex } from './summary-view'

describe('summary-view', () => {
  it('slugifies a display name', () => {
    expect(slugifyAuthor('alina.reads')).toBe('alina-reads')
    expect(slugifyAuthor('Дмитрий В.')).toBe('дмитрий-в')
  })

  it('falls back to "author" for empty slug', () => {
    expect(slugifyAuthor('...')).toBe('author')
  })

  it('dedupes colliding slugs by order', () => {
    expect(buildAuthorSlugs([
      { displayName: 'Сергей' },
      { displayName: 'Сергей' },
      { displayName: 'Аня' },
    ])).toEqual(['сергей', 'сергей-2', 'аня'])
  })

  it('estimates reading minutes at 150 wpm, min 1', () => {
    expect(estimateReadingMinutes('слово ещё текст')).toBe(1)
    expect(estimateReadingMinutes(Array(300).fill('слово').join(' '))).toBe(2)
  })

  it('selects index by param, defaulting to 0 on miss', () => {
    const slugs = ['аня', 'боря']
    expect(selectSummaryIndex(slugs, 'боря')).toBe(1)
    expect(selectSummaryIndex(slugs, undefined)).toBe(0)
    expect(selectSummaryIndex(slugs, 'нет-такого')).toBe(0)
  })
})

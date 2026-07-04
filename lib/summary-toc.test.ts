import { slugify, extractH2Headings, createSlugger } from './summary-toc'

describe('slugify', () => {
  it('lowercases, trims, replaces non-word runs with single dash', () => {
    expect(slugify('  Ключевые Идеи!  ')).toBe('ключевые-идеи')
    expect(slugify('Chapter 1: Intro')).toBe('chapter-1-intro')
  })
  it('falls back to "section" for empty result', () => {
    expect(slugify('!!!')).toBe('section')
  })
})

describe('extractH2Headings', () => {
  it('extracts only level-2 headings in document order', () => {
    const md = '# Заголовок\n\n## Контекст\n\nтекст\n\n### Мелочь\n\n## Выводы\n'
    expect(extractH2Headings(md)).toEqual([
      { id: 'контекст', text: 'Контекст' },
      { id: 'выводы', text: 'Выводы' },
    ])
  })

  it('strips inline markdown from the visible text but keeps it readable', () => {
    const md = '## **Главная** мысль и [ссылка](https://x.io)\n'
    expect(extractH2Headings(md)).toEqual([
      { id: 'главная-мысль-и-ссылка', text: 'Главная мысль и ссылка' },
    ])
  })

  it('dedupes colliding slugs with numeric suffixes', () => {
    const md = '## Итог\n\n## Итог\n\n## Итог\n'
    expect(extractH2Headings(md).map(h => h.id)).toEqual(['итог', 'итог-2', 'итог-3'])
  })

  it('ignores "##" inside fenced code blocks', () => {
    const md = '## Реальный\n\n```\n## не заголовок\n```\n\n## Второй\n'
    expect(extractH2Headings(md).map(h => h.text)).toEqual(['Реальный', 'Второй'])
  })

  it('returns [] when there are no level-2 headings', () => {
    expect(extractH2Headings('# Только H1\n\nтекст')).toEqual([])
  })

  it('excludes ## headings nested inside a blockquote', () => {
    const md = '> ## В цитате\n\n## Настоящий\n'
    expect(extractH2Headings(md)).toEqual([{ id: 'настоящий', text: 'Настоящий' }])
  })

  it('excludes ## headings nested inside a <details> block', () => {
    const md = [
      '<details>',
      '<summary>Спойлер</summary>',
      '',
      '## Внутри деталей',
      '</details>',
      '',
      '## Настоящий',
    ].join('\n')
    expect(extractH2Headings(md)).toEqual([{ id: 'настоящий', text: 'Настоящий' }])
  })
})

describe('createSlugger', () => {
  it('produces stable ids matching extractH2Headings for the same sequence of texts', () => {
    const slug = createSlugger()
    expect(slug('Итог')).toBe('итог')
    expect(slug('Итог')).toBe('итог-2')
    expect(slug('Итог')).toBe('итог-3')
  })
})

import { WikipediaUrlError, parseWikipediaUrl } from './url'

describe('parseWikipediaUrl', () => {
  it.each([
    ['https://ru.wikipedia.org/wiki/Социализм', 'ru', 'Социализм'],
    ['https://en.wikipedia.org/wiki/Socialism', 'en', 'Socialism'],
    ['https://zh-min-nan.wikipedia.org/wiki/Siā-hōe-chú-gī', 'zh-min-nan', 'Siā-hōe-chú-gī'],
    ['https://ru.m.wikipedia.org/wiki/Социализм#История', 'ru', 'Социализм'],
    ['https://de.wikipedia.org/w/index.php?title=Sozialismus', 'de', 'Sozialismus'],
  ])('normalizes %s', (input, language, title) => {
    expect(parseWikipediaUrl(input)).toMatchObject({ language, title })
  })

  it('normalizes underscores and builds a canonical encoded article URL', () => {
    expect(parseWikipediaUrl('https://ru.m.wikipedia.org/wiki/История_социализма?oldid=1#История')).toEqual({
      language: 'ru',
      title: 'История социализма',
      articleUrl: 'https://ru.wikipedia.org/wiki/%D0%98%D1%81%D1%82%D0%BE%D1%80%D0%B8%D1%8F_%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC%D0%B0',
    })
  })

  it('decodes a pathname title exactly once', () => {
    expect(parseWikipediaUrl('https://en.wikipedia.org/wiki/Percent%2520encoded')).toMatchObject({
      title: 'Percent%20encoded',
      articleUrl: 'https://en.wikipedia.org/wiki/Percent%2520encoded',
    })
  })

  it('does not double-decode a title read from URLSearchParams', () => {
    expect(parseWikipediaUrl('https://en.wikipedia.org/w/index.php?title=Percent%2520encoded')).toMatchObject({
      title: 'Percent%20encoded',
      articleUrl: 'https://en.wikipedia.org/wiki/Percent%2520encoded',
    })
  })

  it.each([
    'http://ru.wikipedia.org/wiki/Социализм',
    'https://www.wikipedia.org/',
    'https://wikipedia.org.example.com/wiki/Социализм',
    'https://commons.wikimedia.org/wiki/File:Example.jpg',
    'https://ru.wikipedia.org/',
    'https://ru.wikipedia.org/wiki/',
    'https://ru.wikipedia.org/w/index.php',
    'https://ru.wikipedia.org/wiki/%00',
    'https://ru.wikipedia.org/w/index.php?title=%00',
  ])('rejects unsupported source %s', input => {
    expect(() => parseWikipediaUrl(input)).toThrow(WikipediaUrlError)
  })
})

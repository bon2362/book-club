import { WikipediaUrlError, parseWikipediaUrl } from './url'

describe('parseWikipediaUrl', () => {
  it.each([
    [
      'https://ru.wikipedia.org/wiki/Социализм',
      {
        language: 'ru',
        title: 'Социализм',
        articleUrl: 'https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC',
      },
    ],
    [
      'https://en.wikipedia.org/wiki/Socialism',
      {
        language: 'en',
        title: 'Socialism',
        articleUrl: 'https://en.wikipedia.org/wiki/Socialism',
      },
    ],
    [
      'https://zh-min-nan.wikipedia.org/wiki/Siā-hōe-chú-gī',
      {
        language: 'zh-min-nan',
        title: 'Siā-hōe-chú-gī',
        articleUrl: 'https://zh-min-nan.wikipedia.org/wiki/Si%C4%81-h%C5%8De-ch%C3%BA-g%C4%AB',
      },
    ],
    [
      'https://ru.m.wikipedia.org/wiki/Социализм#История',
      {
        language: 'ru',
        title: 'Социализм',
        articleUrl: 'https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC',
      },
    ],
    [
      'https://de.wikipedia.org/w/index.php?title=Sozialismus',
      {
        language: 'de',
        title: 'Sozialismus',
        articleUrl: 'https://de.wikipedia.org/wiki/Sozialismus',
      },
    ],
    [
      'https://en.wikipedia.org:443/w/index.php?title=C%2B%2B',
      {
        language: 'en',
        title: 'C++',
        articleUrl: 'https://en.wikipedia.org/wiki/C%2B%2B',
      },
    ],
  ])('normalizes %s', (input, expected) => {
    expect(parseWikipediaUrl(input)).toEqual(expected)
  })

  it('normalizes underscores and builds a canonical encoded article URL', () => {
    expect(parseWikipediaUrl('https://ru.m.wikipedia.org/wiki/История_социализма?oldid=1#История')).toEqual({
      language: 'ru',
      title: 'История социализма',
      articleUrl: 'https://ru.wikipedia.org/wiki/%D0%98%D1%81%D1%82%D0%BE%D1%80%D0%B8%D1%8F_%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC%D0%B0',
    })
  })

  it('decodes a pathname title exactly once', () => {
    expect(parseWikipediaUrl('https://en.wikipedia.org/wiki/Percent%2520encoded')).toEqual({
      language: 'en',
      title: 'Percent%20encoded',
      articleUrl: 'https://en.wikipedia.org/wiki/Percent%2520encoded',
    })
  })

  it('does not double-decode a title read from URLSearchParams', () => {
    expect(parseWikipediaUrl('https://en.wikipedia.org/w/index.php?title=Percent%2520encoded')).toEqual({
      language: 'en',
      title: 'Percent%20encoded',
      articleUrl: 'https://en.wikipedia.org/wiki/Percent%2520encoded',
    })
  })

  it.each([
    'https://en.wikipedia.org/w/index.php?title=%E0%A4%A',
    'https://en.wikipedia.org/w/index.php?title=%C0%AF',
    'https://en.wikipedia.org/w/index.php?title=100%',
  ])('rejects malformed query title encoding in %s', input => {
    expect(() => parseWikipediaUrl(input)).toThrow(WikipediaUrlError)
  })

  it.each(['-x', 'x-', 'x--y'])('rejects malformed language hostname label %s', language => {
    expect(() => parseWikipediaUrl(`https://${language}.wikipedia.org/wiki/Article`)).toThrow(WikipediaUrlError)
  })

  it.each([false, true])('rejects URL credentials (password: %s)', withPassword => {
    const input = new URL('https://en.wikipedia.org/wiki/Socialism')
    input.username = 'reader'
    if (withPassword) input.password = ['test', 'value'].join('-')

    expect(() => parseWikipediaUrl(input.href)).toThrow(WikipediaUrlError)
  })

  it('rejects a non-default port', () => {
    expect(() => parseWikipediaUrl('https://en.wikipedia.org:444/wiki/Socialism')).toThrow(WikipediaUrlError)
  })

  const forbiddenTitleCharacters = [
    ...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCodePoint(codePoint)),
    String.fromCodePoint(0x7f),
    '[',
    ']',
    '{',
    '}',
    '|',
    '<',
    '>',
    '#',
  ]

  it.each(forbiddenTitleCharacters)('rejects forbidden title character %p', character => {
    const encodedTitle = encodeURIComponent(`Before${character}After`)
    expect(() => parseWikipediaUrl(`https://en.wikipedia.org/wiki/${encodedTitle}`)).toThrow(WikipediaUrlError)
  })

  it('applies forbidden title validation to query titles', () => {
    expect(() => parseWikipediaUrl('https://en.wikipedia.org/w/index.php?title=Before%7CAfter'))
      .toThrow(WikipediaUrlError)
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

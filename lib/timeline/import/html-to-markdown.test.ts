import { htmlToMarkdown } from './html-to-markdown'

describe('htmlToMarkdown', () => {
  it('returns an empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })

  it('unwraps a paragraph into a bare line', () => {
    expect(htmlToMarkdown('<p>Просто текст</p>')).toBe('Просто текст')
  })

  it('separates paragraphs with a blank line', () => {
    expect(htmlToMarkdown('<p>Первый</p><p>Второй</p>')).toBe('Первый\n\nВторой')
  })

  it('converts a link to markdown, keeping the href', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">Тут</a></p>'))
      .toBe('[Тут](https://example.com)')
  })

  it('drops rel and target attributes the editor added', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">Тут</a></p>'))
      .toBe('[Тут](https://example.com)')
  })

  it('converts strong to double asterisks', () => {
    expect(htmlToMarkdown('<p>Это <strong>важно</strong></p>')).toBe('Это **важно**')
  })

  it('converts an unordered list to dashed lines', () => {
    expect(htmlToMarkdown('<ul><li>Один</li><li>Два</li></ul>')).toBe('- Один\n- Два')
  })

  it('keeps a link inside a list item', () => {
    expect(htmlToMarkdown('<ul><li><a href="https://example.com">Ссылка</a></li></ul>'))
      .toBe('- [Ссылка](https://example.com)')
  })

  it('decodes HTML entities in text', () => {
    expect(htmlToMarkdown('<p>Кавычки &amp; амперсанд</p>')).toBe('Кавычки & амперсанд')
  })

  it('escapes markdown characters that appear literally in the text', () => {
    expect(htmlToMarkdown('<p>Скидка 50*70</p>')).toBe('Скидка 50\\*70')
  })

  it('leaves underscores alone so link addresses stay readable', () => {
    expect(htmlToMarkdown('<p><a href="https://e.com/Second_Thirty_Years">Second_Thirty_Years</a></p>'))
      .toBe('[Second_Thirty_Years](https://e.com/Second_Thirty_Years)')
  })

  it('throws on a tag the converter does not know', () => {
    expect(() => htmlToMarkdown('<table><tr><td>x</td></tr></table>'))
      .toThrow(/table/)
  })
})

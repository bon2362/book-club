import { bodyToParagraphs } from './intro-format'

describe('bodyToParagraphs', () => {
  it('returns single paragraph for plain text', () => {
    expect(bodyToParagraphs('Hello world')).toEqual(['Hello world'])
  })

  it('splits on double newlines', () => {
    expect(bodyToParagraphs('First.\n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('splits on more than two newlines', () => {
    expect(bodyToParagraphs('First.\n\n\n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('keeps single newlines inside a paragraph', () => {
    expect(bodyToParagraphs('Line 1\nLine 2')).toEqual(['Line 1\nLine 2'])
  })

  it('trims whitespace around paragraphs', () => {
    expect(bodyToParagraphs('  First.  \n\n  Second.  ')).toEqual(['First.', 'Second.'])
  })

  it('filters empty paragraphs', () => {
    expect(bodyToParagraphs('First.\n\n\n\n\n\nSecond.\n\n   ')).toEqual(['First.', 'Second.'])
  })

  it('returns empty array for empty input', () => {
    expect(bodyToParagraphs('')).toEqual([])
    expect(bodyToParagraphs('   ')).toEqual([])
  })
})

import type { Blockquote, Root } from 'mdast'
import { remarkWikipediaEmbeds } from './markdown'

function transform(blockquote: Blockquote): Blockquote {
  const root: Root = { type: 'root', children: [blockquote] }
  const plugin = remarkWikipediaEmbeds()
  plugin(root)
  return root.children[0] as Blockquote
}

describe('remarkWikipediaEmbeds', () => {
  it('marks a portable Wikipedia blockquote and keeps author Markdown', () => {
    const result = transform({
      type: 'blockquote',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'Авторский текст' }] },
        {
          type: 'paragraph',
          children: [{
            type: 'link',
            url: 'https://en.wikipedia.org/wiki/Socialism',
            title: 'wikipedia',
            children: [{ type: 'text', value: 'Wikipedia: Socialism' }],
          }],
        },
      ],
    })

    expect(result.children).toHaveLength(1)
    expect(result.data).toMatchObject({
      hName: 'aside',
      hProperties: {
        'data-wikipedia-embed': 'true',
        'data-wikipedia-source': 'https://en.wikipedia.org/wiki/Socialism',
      },
    })
  })

  it.each(['Wikipedia', null])('keeps ordinary blockquotes for title %s', title => {
    const input: Blockquote = {
      type: 'blockquote',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'link',
          url: 'https://en.wikipedia.org/wiki/Socialism',
          title,
          children: [{ type: 'text', value: 'source' }],
        }],
      }],
    }
    expect(transform(input).data).toBeUndefined()
  })

  it('does not create an empty widget from a source-only quote', () => {
    const input: Blockquote = {
      type: 'blockquote',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'link',
          url: 'https://en.wikipedia.org/wiki/Socialism',
          title: 'wikipedia',
          children: [{ type: 'text', value: 'source' }],
        }],
      }],
    }
    expect(transform(input).data).toBeUndefined()
  })
})

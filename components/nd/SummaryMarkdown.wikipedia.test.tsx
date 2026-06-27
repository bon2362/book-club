import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import type { Blockquote, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import SummaryMarkdown from './SummaryMarkdown'

// react-markdown is ESM and cannot run under Jest, so the real renderer is mocked.
// This mock builds an mdast for blockquote groups and runs the *real* remarkPlugins
// (remarkWikipediaEmbeds) so the transform → aside → WikipediaEmbed wiring is exercised
// for real. Only the Markdown → mdast parsing step is simulated.
type PluginFactory = () => (tree: Root) => void
type Components = Record<string, (props: { children?: ReactNode; [key: string]: unknown }) => ReactNode>

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({
    children,
    remarkPlugins = [],
    components = {},
  }: {
    children: string
    remarkPlugins?: PluginFactory[]
    components?: Components
  }) => {
    const root = buildMdast(children)
    for (const plugin of remarkPlugins) plugin()(root)
    return <div>{root.children.map((node, index) => renderNode(node, String(index), components))}</div>
  },
}))

const LINK_LINE = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/

function buildMdast(markdown: string): Root {
  const blocks = markdown.split(/\n{2,}/)
  const children: RootContent[] = blocks.map(block => {
    const lines = block.split('\n')
    if (lines.length > 0 && lines.every(line => line.startsWith('>'))) {
      return buildBlockquote(lines)
    }
    return { type: 'paragraph', children: [{ type: 'text', value: block }] } as Paragraph
  })
  return { type: 'root', children }
}

function buildBlockquote(lines: string[]): Blockquote {
  const content = lines.map(line => line.replace(/^>\s?/, ''))
  const paragraphs: Paragraph[] = []
  let buffer: string[] = []
  const flush = () => {
    if (!buffer.length) return
    paragraphs.push(toParagraph(buffer.join(' ')))
    buffer = []
  }
  for (const line of content) {
    if (line.trim() === '') flush()
    else buffer.push(line)
  }
  flush()
  return { type: 'blockquote', children: paragraphs }
}

function toParagraph(text: string): Paragraph {
  const match = text.match(LINK_LINE)
  const children: PhrasingContent[] = match
    ? [{ type: 'link', url: match[2], title: match[3] ?? null, children: [{ type: 'text', value: match[1] }] }]
    : [{ type: 'text', value: text }]
  return { type: 'paragraph', children }
}

function renderNode(node: RootContent, key: string, components: Components): ReactNode {
  if (node.type === 'blockquote') {
    const data = node.data as { hName?: string; hProperties?: Record<string, unknown> } | undefined
    if (data?.hName === 'aside' && components.aside) {
      const props = data.hProperties ?? {}
      return (
        <span key={key}>
          {components.aside({
            'data-wikipedia-embed': props['data-wikipedia-embed'],
            'data-wikipedia-source': props['data-wikipedia-source'],
            children: node.children.map((child, index) => renderNode(child, `${key}-${index}`, components)),
          })}
        </span>
      )
    }
    const Blockquote = components.blockquote ?? (({ children }) => <blockquote>{children}</blockquote>)
    return (
      <Blockquote key={key}>
        {node.children.map((child, index) => renderNode(child, `${key}-${index}`, components))}
      </Blockquote>
    )
  }
  if (node.type === 'paragraph') {
    const P = components.p ?? (({ children }) => <p>{children}</p>)
    return <P key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`, components))}</P>
  }
  return null
}

function renderInline(node: PhrasingContent, key: string, components: Components): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type === 'link') {
    const A = components.a ?? (({ children, href }) => <a href={href as string}>{children}</a>)
    return (
      <A key={key} href={node.url}>
        {node.children.map((child, index) => renderInline(child, `${key}-${index}`, components))}
      </A>
    )
  }
  return null
}

describe('SummaryMarkdown Wikipedia integration', () => {
  beforeEach(() => {
    ;(global.fetch as unknown) = jest.fn(() => new Promise(() => {}))
  })

  it('renders a portable Wikipedia blockquote as an embed with author text', () => {
    render(
      <SummaryMarkdown
        markdown={[
          '> Авторский текст про социализм',
          '>',
          '> [Wikipedia: Socialism](https://en.wikipedia.org/wiki/Socialism "wikipedia")',
        ].join('\n')}
      />,
    )

    expect(document.querySelector('.nd-wikipedia-embed')).toBeInTheDocument()
    expect(screen.getByText('Авторский текст про социализм')).toBeInTheDocument()
    expect(document.querySelector('.nd-summary-blockquote')).toBeNull()
  })

  it('keeps an ordinary blockquote untouched', () => {
    render(<SummaryMarkdown markdown={'> Обычная цитата без источника.'} />)

    expect(document.querySelector('.nd-summary-blockquote')).toBeInTheDocument()
    expect(document.querySelector('.nd-wikipedia-embed')).toBeNull()
  })

  it('does not build an embed from a deceptive Wikipedia host', () => {
    render(
      <SummaryMarkdown
        markdown={[
          '> Текст автора',
          '>',
          '> [x](https://wikipedia.org.evil.com/wiki/X "wikipedia")',
        ].join('\n')}
      />,
    )

    expect(document.querySelector('.nd-wikipedia-embed')).toBeNull()
    expect(document.querySelector('.nd-summary-blockquote')).toBeInTheDocument()
  })

  it('never executes raw HTML', () => {
    render(<SummaryMarkdown markdown={'<script>alert(1)</script>'} />)
    expect(document.querySelector('script')).toBeNull()
  })
})

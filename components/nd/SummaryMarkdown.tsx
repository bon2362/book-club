import React from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { remarkWikipediaEmbeds } from '@/lib/wikipedia/markdown'
import { createSlugger } from '@/lib/summary-toc'
import WikipediaEmbed from './WikipediaEmbed'

interface Props {
  markdown: string
}

/** Рекурсивно склеивает текстовое содержимое узла (в т.ч. вложенных элементов вроде <strong>). */
function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode }).children
    return flattenText(children)
  }
  return ''
}

export default function SummaryMarkdown({ markdown }: Props) {
  // Один слаггер на весь рендер (включая вложенные <details>-блоки) —
  // id самодостаточен: выводится из текста самого заголовка, а не из
  // индекса эмита, поэтому лишние/вложенные <h2> не сбивают нумерацию.
  const slugger = createSlugger()
  const components = buildComponents(slugger)
  return (
    <div
      style={{
        fontFamily: 'var(--nd-serif), Georgia, serif',
        fontSize: '1rem',
        lineHeight: 1.75,
        color: 'var(--text-body)',
      }}
    >
      <MarkdownContent markdown={markdown} components={components} />
    </div>
  )
}

function MarkdownContent({ markdown, components }: { markdown: string; components: Components }) {
  const detailsPattern = /<details( open)?>\s*\n<summary>(.*?)<\/summary>\s*\n?([\s\S]*?)\n?<\/details>/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = detailsPattern.exec(markdown)) !== null) {
    const [source, openAttr, summary, body] = match
    const before = markdown.slice(lastIndex, match.index)
    if (before) {
      parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={before} components={components} />)
    }

    parts.push(
      React.createElement(
        'details',
        { key: `details-${match.index}`, className: 'nd-summary-details', open: openAttr !== undefined },
        React.createElement('summary', { className: 'nd-summary-details__summary' },
          React.createElement('span', { className: 'nd-summary-details__rail', 'aria-hidden': 'true' }),
          React.createElement('span', { className: 'nd-summary-details__title' }, summary),
        ),
        React.createElement('div', { className: 'nd-summary-details__body' },
          <MarkdownContent markdown={body.trim()} components={components} />,
        ),
      ),
    )

    lastIndex = match.index + source.length
  }

  const after = markdown.slice(lastIndex)
  if (after) {
    parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={after} components={components} />)
  }

  return <>{parts}</>
}

function MarkdownBlock({ markdown, components }: { markdown: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkWikipediaEmbeds]} components={components}>
      {markdown}
    </ReactMarkdown>
  )
}

type ComponentProps = { children: React.ReactNode; [key: string]: unknown }

function buildComponents(slugger: (text: string) => string): Record<string, React.ComponentType<ComponentProps>> {
  const createAsideComponent = (props: ComponentProps) => {
    const attrs = props as Record<string, unknown>
    const source = attrs['data-wikipedia-source']
    if (attrs['data-wikipedia-embed'] === 'true' && typeof source === 'string') {
      return React.createElement(
        WikipediaEmbed as React.ComponentType<{ sourceUrl: string; children?: React.ReactNode }>,
        { sourceUrl: source as string },
        props.children,
      )
    }
    return React.createElement('aside', {}, props.children)
  }

  const createAnchorComponent = ({ href, children }: ComponentProps) =>
    React.createElement('a', { href, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } }, children)

  const createH1Component = ({ children }: ComponentProps) =>
    React.createElement('h1', { style: { fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', lineHeight: 1.15, margin: '1.5rem 0 0.75rem' } }, children)

  const createH2Component = ({ children }: ComponentProps) => {
    const id = slugger(flattenText(children))
    return React.createElement('h2', {
      id,
      style: {
        fontFamily: 'var(--nd-serif)',
        fontSize: '1.35rem',
        lineHeight: 1.2,
        margin: '1.35rem 0 0.6rem',
        scrollMarginTop: 'calc(var(--header-height, 0px) + 1rem)',
      },
    }, children)
  }

  const createH3Component = ({ children }: ComponentProps) =>
    React.createElement('h3', { style: { fontFamily: 'var(--nd-sans)', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.4, margin: '2.25rem 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--accent)' } }, children)

  const createH4Component = ({ children }: ComponentProps) =>
    React.createElement('h4', { style: { fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', lineHeight: 1.4, margin: '1rem 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' } }, children)

  const createPComponent = ({ children }: ComponentProps) =>
    React.createElement('p', { style: { margin: '0 0 1rem' } }, children)

  const createBlockquoteComponent = ({ children }: ComponentProps) => {
    const mark = React.createElement('span', { className: 'nd-summary-blockquote__mark', 'aria-hidden': 'true' }, '“')
    return React.createElement('blockquote', { className: 'nd-summary-blockquote' }, mark, children)
  }

  const createUlComponent = ({ children }: ComponentProps) =>
    React.createElement('ul', { style: { listStyleType: 'disc', listStylePosition: 'outside', margin: '1rem 0', paddingLeft: '1.35rem' } }, children)

  const createOlComponent = ({ children }: ComponentProps) =>
    React.createElement('ol', { style: { listStyleType: 'decimal', listStylePosition: 'outside', margin: '1rem 0', paddingLeft: '1.45rem' } }, children)

  const createLiComponent = ({ children }: ComponentProps) =>
    React.createElement('li', { style: { margin: '0.2rem 0', paddingLeft: '0.15rem' } }, children)

  return {
    aside: createAsideComponent,
    a: createAnchorComponent,
    h1: createH1Component,
    h2: createH2Component,
    h3: createH3Component,
    h4: createH4Component,
    p: createPComponent,
    blockquote: createBlockquoteComponent,
    ul: createUlComponent,
    ol: createOlComponent,
    li: createLiComponent,
  }
}

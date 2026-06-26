import ReactMarkdown from 'react-markdown'

interface Props {
  markdown: string
}

export default function SummaryMarkdown({ markdown }: Props) {
  return (
    <div
      style={{
        fontFamily: 'var(--nd-serif), Georgia, serif',
        fontSize: '1rem',
        lineHeight: 1.75,
        color: 'var(--text-body)',
      }}
    >
      <MarkdownContent markdown={markdown} />
    </div>
  )
}

function MarkdownContent({ markdown }: Props) {
  const detailsPattern = /<details( open)?>\s*\n<summary>(.*?)<\/summary>\s*\n?([\s\S]*?)\n?<\/details>/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = detailsPattern.exec(markdown)) !== null) {
    const [source, openAttr, summary, body] = match
    const before = markdown.slice(lastIndex, match.index)
    if (before) {
      parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={before} />)
    }

    parts.push(
      <details
        key={`details-${match.index}`}
        open={openAttr !== undefined}
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          margin: '1.25rem 0',
          padding: '0.65rem 0',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.76rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            lineHeight: 1.4,
            textTransform: 'uppercase',
            color: 'var(--text)',
          }}
        >
          {summary}
        </summary>
        <div style={{ marginTop: '0.85rem' }}>
          <MarkdownContent markdown={body.trim()} />
        </div>
      </details>,
    )

    lastIndex = match.index + source.length
  }

  const after = markdown.slice(lastIndex)
  if (after) {
    parts.push(<MarkdownBlock key={`md-${lastIndex}`} markdown={after} />)
  }

  return <>{parts}</>
}

function MarkdownBlock({ markdown }: Props) {
  return (
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', lineHeight: 1.15, margin: '1.5rem 0 0.75rem' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.35rem', lineHeight: 1.2, margin: '1.35rem 0 0.6rem' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.12rem', lineHeight: 1.25, margin: '1.2rem 0 0.5rem' }}>{children}</h3>,
          h4: ({ children }) => <h4 style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', lineHeight: 1.4, margin: '1rem 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>{children}</h4>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: '2px solid var(--border-strong)', margin: '1rem 0', paddingLeft: '1rem', fontStyle: 'italic' }}>{children}</blockquote>,
        }}
      >
        {markdown}
      </ReactMarkdown>
  )
}

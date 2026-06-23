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
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', lineHeight: 1.15, margin: '1.5rem 0 0.75rem' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.35rem', lineHeight: 1.2, margin: '1.35rem 0 0.6rem' }}>{children}</h2>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: '2px solid var(--border-strong)', margin: '1rem 0', paddingLeft: '1rem', fontStyle: 'italic' }}>{children}</blockquote>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

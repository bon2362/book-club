import Link from 'next/link'
import AuthorAvatar from './AuthorAvatar'

export interface SwitcherAuthor {
  slug: string
  displayName: string
}

interface Props {
  authors: SwitcherAuthor[]
  activeSlug: string
  basePath: string
  writeHref: string
}

const writeCta: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--accent)',
  textDecoration: 'none',
  border: '1px solid var(--border)',
  padding: '0.45rem 0.7rem',
}

export default function SummaryAuthorSwitcher({ authors, activeSlug, basePath, writeHref }: Props) {
  if (authors.length <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Пока одно саммари этой книги.</span>
        <Link href={writeHref} style={writeCta}>+ Написать своё</Link>
      </div>
    )
  }
  return (
    <nav aria-label="Авторы саммари" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
      {authors.map(author => {
        const active = author.slug === activeSlug
        return (
          <Link
            key={author.slug}
            href={`${basePath}?author=${encodeURIComponent(author.slug)}`}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.7rem 0.3rem 0.3rem',
              border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
              color: active ? 'var(--text)' : 'var(--text-secondary)',
              textDecoration: 'none',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.82rem',
              background: 'var(--bg)',
            }}
          >
            <AuthorAvatar name={author.displayName} size={26} />
            {author.displayName}
          </Link>
        )
      })}
      <Link href={writeHref} style={writeCta}>+ Написать своё</Link>
    </nav>
  )
}

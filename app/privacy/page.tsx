import type { Metadata } from 'next'
import Link from 'next/link'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ReactMarkdown from 'react-markdown'

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — Долгое наступление',
  description: 'Как мы обрабатываем персональные данные пользователей сайта slowreading.club',
}

const EFFECTIVE_DATE = '18 мая 2026'

const linkStyle: React.CSSProperties = {
  color: '#222',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--nd-serif), Georgia, serif',
  fontSize: '1.2rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  margin: '2rem 0 0.75rem',
}

const pStyle: React.CSSProperties = {
  margin: '0 0 1rem',
}

const ulStyle: React.CSSProperties = {
  paddingLeft: '1.25rem',
  margin: '0 0 1rem',
}

export default function PrivacyPage() {
  const markdown = readFileSync(join(process.cwd(), 'content', 'privacy.md'), 'utf-8')

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        color: '#222',
        lineHeight: 1.6,
      }}
    >
      <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
        Долгое наступление · Читательские круги
      </p>
      <h1
        style={{
          fontFamily: 'var(--nd-serif), Georgia, serif',
          fontWeight: 700,
          fontSize: '2rem',
          letterSpacing: '-0.02em',
          margin: '0 0 0.5rem',
        }}
      >
        Политика конфиденциальности
      </h1>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 2rem' }}>
        Действует с {EFFECTIVE_DATE} года. Применяется к сайту{' '}
        <a href="https://www.slowreading.club" style={linkStyle}>slowreading.club</a>.
      </p>

      <ReactMarkdown
        components={{
          h2: ({ children }) => <h2 style={h2Style}>{children}</h2>,
          p: ({ children }) => <p style={pStyle}>{children}</p>,
          ul: ({ children }) => <ul style={ulStyle}>{children}</ul>,
          a: ({ href, children }) => {
            const isExternal = href?.startsWith('http')
            return (
              <a
                href={href}
                style={linkStyle}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>

      <p style={{ marginTop: '3rem', fontSize: '0.85rem' }}>
        <Link href="/" style={linkStyle}>← На главную</Link>
      </p>
    </main>
  )
}

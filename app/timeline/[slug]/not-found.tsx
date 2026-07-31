import Link from 'next/link'

export default function TimelineNotFound() {
  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '4rem 1.5rem',
        fontFamily: 'var(--nd-sans)',
        color: 'var(--text-body)',
        lineHeight: 1.6,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--nd-serif)',
          fontWeight: 700,
          fontSize: '1.8rem',
          letterSpacing: '-0.02em',
          color: 'var(--text)',
          margin: '0 0 0.6rem',
        }}
      >
        Лента не найдена
      </h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
        Такой ленты времени нет или она ещё не опубликована.
      </p>
      <Link
        href="/timeline"
        style={{
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text)',
          textDecoration: 'none',
          borderBottom: '1px solid var(--border-strong)',
          paddingBottom: '1px',
        }}
      >
        Все ленты времени
      </Link>
    </main>
  )
}

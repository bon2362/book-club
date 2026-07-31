import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { fetchTimelineSummaries } from '@/lib/timeline/queries'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ленты времени — Долгое наступление',
  description: 'Исторические таймлайны книжного клуба: события, эпохи и связи между ними.',
}

function plural(count: number): string {
  const tail = count % 100
  if (tail >= 11 && tail <= 14) return 'событий'
  switch (count % 10) {
    case 1: return 'событие'
    case 2:
    case 3:
    case 4: return 'события'
    default: return 'событий'
  }
}

export default async function TimelineIndexPage() {
  const session = await auth()
  const isAdmin = session?.user?.isAdmin ?? false
  const timelines = await fetchTimelineSummaries({ includeUnpublished: isAdmin })

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
        fontFamily: 'var(--nd-sans)',
        color: 'var(--text-body)',
        lineHeight: 1.6,
      }}
    >
      <p
        style={{
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--text-muted)',
          margin: '0 0 0.5rem',
        }}
      >
        <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          Долгое наступление
        </Link>{' '}
        · Ленты времени
      </p>

      <h1
        style={{
          fontFamily: 'var(--nd-serif)',
          fontWeight: 700,
          fontSize: '2rem',
          letterSpacing: '-0.02em',
          color: 'var(--text)',
          margin: '0 0 0.6rem',
        }}
      >
        Ленты времени
      </h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 2.5rem' }}>
        Исторические таймлайны клуба: события и эпохи на одном полотне. Каждой лентой можно
        поделиться ссылкой — вход на сайт для чтения не нужен.
      </p>

      {timelines.length === 0 ? (
        <p data-testid="timeline-empty" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Пока не опубликовано ни одной ленты. Как только первая лента появится, она будет здесь —
          вместе со ссылкой, которой можно поделиться.
        </p>
      ) : (
        <ul data-testid="timeline-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {timelines.map((timeline) => (
            <li
              key={timeline.id}
              data-testid="timeline-list-item"
              data-slug={timeline.slug}
              style={{
                borderTop: '1px solid var(--border)',
                // Черновик отмечается акцентной линией слева, а не заливкой.
                borderLeft: timeline.published ? 'none' : '3px solid var(--accent)',
                padding: '1.1rem 0',
                paddingLeft: timeline.published ? 0 : '0.9rem',
              }}
            >
              <Link
                href={`/timeline/${timeline.slug}`}
                style={{
                  fontFamily: 'var(--nd-serif)',
                  fontSize: '1.25rem',
                  color: 'var(--text)',
                  textDecoration: 'none',
                  letterSpacing: '-0.01em',
                }}
              >
                {timeline.title}
              </Link>
              {timeline.description ? (
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0.5rem' }}>
                  {timeline.description}
                </p>
              ) : null}
              <p
                style={{
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                  margin: 0,
                }}
              >
                {timeline.eventCount} {plural(timeline.eventCount)}
                {timeline.published ? null : (
                  <span data-testid="timeline-draft-badge" style={{ color: 'var(--accent)' }}> · черновик</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

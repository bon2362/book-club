import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { fetchTimelineBySlug } from '@/lib/timeline/queries'
import TimelineView from '@/components/nd/timeline/TimelineView'

// Страница читает базу на каждый запрос: без этого Next закэширует её на
// сборке и правки данных в ленте не будут видны.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const timeline = await fetchTimelineBySlug(params.slug)
  if (timeline === null || !timeline.published) return {}

  const description = timeline.description || 'Лента времени книжного клуба «Долгое наступление».'
  return {
    title: `${timeline.title} — лента времени`,
    description,
    alternates: { canonical: `/timeline/${timeline.slug}` },
    openGraph: {
      title: `${timeline.title} — лента времени`,
      description,
      url: `/timeline/${timeline.slug}`,
      type: 'article',
    },
  }
}

export default async function TimelinePage({ params }: { params: { slug: string } }) {
  const session = await auth()
  const isAdmin = session?.user?.isAdmin ?? false
  const timeline = await fetchTimelineBySlug(params.slug, { includeLibrary: isAdmin })

  // Неопубликованная лента существует только для админа: остальным её нет.
  if (timeline === null || (!timeline.published && !isAdmin)) notFound()

  return (
    <main
      className="nd-timeline-page"
      style={{
        fontFamily: 'var(--nd-sans)',
        color: 'var(--text-body)',
        lineHeight: 1.6,
      }}
    >
      <div className="nd-timeline-heading">
      <p
        style={{
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--text-muted)',
          margin: '0 0 0.35rem',
        }}
      >
        <Link href="/timeline" style={{ color: 'inherit', textDecoration: 'none' }}>
          Ленты времени
        </Link>
        {timeline.published ? null : (
          <span data-testid="timeline-draft-badge" style={{ color: 'var(--accent)' }}> · черновик</span>
        )}
      </p>

      <h1
        style={{
          fontFamily: 'var(--nd-serif)',
          fontWeight: 700,
          fontSize: '1.75rem',
          letterSpacing: '-0.02em',
          color: 'var(--text)',
          margin: 0,
        }}
      >
        {timeline.title}
      </h1>
      {timeline.description ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0', maxWidth: '46rem' }}>
          {timeline.description}
        </p>
      ) : null}
      </div>

      <TimelineView timeline={timeline} />
    </main>
  )
}

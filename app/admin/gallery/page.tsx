import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SPECIES_PHOTOS } from '@/lib/matching/species-images.generated'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Галерея фото видов', robots: { index: false } }

export default async function AdminGalleryPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const entries = Object.entries(SPECIES_PHOTOS).sort(([a], [b]) => a.localeCompare(b, 'ru'))

  const micro: React.CSSProperties = {
    fontFamily: 'var(--nd-sans)',
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
  }

  return (
    <main style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)', padding: '2rem 1.25rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Link href="/admin?tab=matching" style={{ ...micro, color: 'var(--accent)', textDecoration: 'none' }}>
          ← Админка · Матчинг
        </Link>
        <h1 style={{ margin: '0.6rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', fontWeight: 700 }}>
          Галерея фото видов
        </h1>
        <p style={{ margin: '0.4rem 0 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {entries.length} изображений. Клик по фото открывает страницу файла на Wikimedia Commons. Замена — через{' '}
          <code>MANUAL_FILES</code> / <code>MANUAL_TITLES</code> в <code>scripts/fetch-pseudonym-photos.ts</code>.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: '14px',
          }}
        >
          {entries.map(([nick, p]) => (
            <figure key={nick} style={{ margin: 0, border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.file}
                  alt={nick}
                  loading="lazy"
                  style={{ width: '100%', height: 150, objectFit: 'contain', background: 'var(--bg-elevated)', display: 'block' }}
                />
              </a>
              <figcaption style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontFamily: 'var(--nd-serif)', fontSize: '0.95rem' }}>{nick}</strong>
                <span style={micro}>{p.license}</span>
                <span style={{ ...micro, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.author}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </main>
  )
}

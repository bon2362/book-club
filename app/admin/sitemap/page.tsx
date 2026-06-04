import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SITE_ROUTES } from '@/lib/site-routes.generated'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Карта сайта', robots: { index: false } }

const GROUPS: { title: string; match: (r: string) => boolean }[] = [
  { title: 'Админка', match: (r) => r.startsWith('/admin') },
  { title: 'Матчинг', match: (r) => r.startsWith('/matching') },
  { title: 'Авторизация', match: (r) => r.startsWith('/auth') },
  { title: 'Служебные', match: (r) => r === '/styleguide' || r === '/vibe' },
]
function groupOf(route: string): string {
  return GROUPS.find((g) => g.match(route))?.title ?? 'Публичные'
}

export default async function AdminSitemapPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const order = ['Публичные', 'Матчинг', 'Авторизация', 'Админка', 'Служебные']
  const grouped = new Map<string, string[]>()
  for (const route of SITE_ROUTES) {
    const g = groupOf(route)
    grouped.set(g, [...(grouped.get(g) ?? []), route])
  }

  const micro: React.CSSProperties = {
    fontFamily: 'var(--nd-sans)',
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
  }

  return (
    <main style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)', padding: '2rem 1.25rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href="/admin" style={{ ...micro, color: 'var(--accent)', textDecoration: 'none' }}>
          ← Админка
        </Link>
        <h1 style={{ margin: '0.6rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', fontWeight: 700 }}>
          Карта сайта
        </h1>
        <p style={{ margin: '0.4rem 0 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {SITE_ROUTES.length} страниц. Список генерируется из файловой структуры (<code>scripts/build-routes.ts</code>).
        </p>

        {order
          .filter((g) => grouped.has(g))
          .map((g) => (
            <section key={g} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ ...micro, marginBottom: '0.5rem' }}>{g}</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--border)' }}>
                {grouped.get(g)!.map((route) => (
                  <li key={route} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Link
                      href={route}
                      style={{
                        display: 'block',
                        padding: '0.55rem 0',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        fontFamily: 'var(--nd-mono, monospace)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {route}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </main>
  )
}

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { db } from '@/lib/db'
import { bookStatuses, tagDescriptions } from '@/lib/db/schema'
import AdminPanel from '@/components/nd/AdminPanel'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const [signups, books, statuses, tagDescs] = await Promise.all([
    getAllSignups(),
    fetchBooksWithCovers(),
    db.select().from(bookStatuses).catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
  ])

  const statusMap = Object.fromEntries(
    statuses.map(s => [s.bookId, s.status as 'reading' | 'read'])
  )

  const allTags = Array.from(new Set(books.flatMap(b => b.tags))).sort()
  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBooks.includes(book.name)),
    }))
    .filter(b => b.users.length > 0)

  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  const shortSha = sha ? sha.slice(0, 7) : null
  const commitMsg = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null
  const buildTime = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString('ru-RU', {
        timeZone: 'Europe/Berlin',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <>
      <SessionProvider>
        <AdminPanel users={signups} byBook={byBook} statuses={statusMap} allTags={allTags} tagDescriptions={tagDescMap} />
      </SessionProvider>
      <footer style={{
        borderTop: '1px solid #E5E5E5',
        padding: '1rem 1.5rem',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        fontSize: '0.7rem',
        color: '#999',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem 1rem',
        alignItems: 'center',
      }}>
        {buildTime && <span>Деплой: <b style={{ color: '#555' }}>{buildTime} CET</b></span>}
        {shortSha && (
          <span>Коммит:{' '}
            <a
              href={`https://github.com/bon2362/book-club/commit/${sha}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#555', fontFamily: 'monospace', textDecoration: 'none', borderBottom: '1px solid #ccc' }}
            >
              {shortSha}
            </a>
          </span>
        )}
        {commitMsg && <span style={{ color: '#777' }}>{commitMsg}</span>}
      </footer>
    </>
  )
}

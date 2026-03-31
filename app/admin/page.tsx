import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { db } from '@/lib/db'
import { bookStatuses, tagDescriptions, bookNewFlags, users, bookPriorities } from '@/lib/db/schema'
import AdminPanel from '@/components/nd/AdminPanel'
import AdminRefresh from '@/components/nd/AdminRefresh'
import AdminStatusBar from '@/components/nd/AdminStatusBar'
import DigestStatusWidget from '@/components/nd/DigestStatusWidget'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const [signups, books, statuses, tagDescs, newFlags, languageRows, allPriorityRows] = await Promise.all([
    getAllSignups(),
    fetchBooksWithCovers(),
    db.select().from(bookStatuses).catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
    db.select().from(bookNewFlags).catch(() => []),
    db.select({ id: users.id, email: users.email, languages: users.languages, prioritiesSet: users.prioritiesSet }).from(users).catch(() => []),
    db.select({ userId: bookPriorities.userId, bookName: bookPriorities.bookName, rank: bookPriorities.rank }).from(bookPriorities).catch(() => []),
  ])

  const userLanguagesMap: Record<string, string[]> = {}
  const emailToPgIdMap: Record<string, string> = {}
  const prioritiesSetMap: Record<string, boolean> = {}
  for (const row of languageRows) {
    if (row.email && row.id) {
      emailToPgIdMap[row.email] = row.id
      prioritiesSetMap[row.id] = row.prioritiesSet ?? false
    }
    if (row.languages && row.email) {
      try { userLanguagesMap[row.email] = JSON.parse(row.languages) } catch { /* skip */ }
    }
  }

  const bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]> = {}
  for (const row of allPriorityRows) {
    if (!bookPrioritiesMap[row.userId]) bookPrioritiesMap[row.userId] = []
    bookPrioritiesMap[row.userId].push({ bookName: row.bookName, rank: row.rank })
  }
  for (const pgId of Object.keys(bookPrioritiesMap)) {
    bookPrioritiesMap[pgId].sort((a, b) => a.rank - b.rank)
  }

  const statusMap = Object.fromEntries(
    statuses.map(s => [s.bookId, s.status as 'reading' | 'read'])
  )

  const allTags = Array.from(new Set(books.flatMap(b => b.tags))).sort()
  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))
  const newFlagsMap = Object.fromEntries(newFlags.map(f => [f.bookId, f.isNew]))

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBooks.includes(book.name)),
    }))

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
      <AdminRefresh />
      <SessionProvider>
        <AdminPanel
          users={signups}
          byBook={byBook}
          statuses={statusMap}
          allTags={allTags}
          tagDescriptions={tagDescMap}
          newFlags={newFlagsMap}
          userLanguages={userLanguagesMap}
          bookPrioritiesMap={bookPrioritiesMap}
          prioritiesSetMap={prioritiesSetMap}
          emailToPgIdMap={emailToPgIdMap}
        />
      </SessionProvider>
      <footer style={{
        borderTop: '1px solid #E5E5E5',
        padding: '1rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        <div style={{
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
        </div>
        <AdminStatusBar />
        <DigestStatusWidget />
      </footer>
    </>
  )
}

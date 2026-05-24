import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signup-books'
import { fetchBooksForAdmin } from '@/lib/books'
import { db } from '@/lib/db'
import { tagDescriptions, users, bookPriorities, books as booksTable } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import AdminPanel from '@/components/nd/AdminPanel'
import AdminRefresh from '@/components/nd/AdminRefresh'
import AdminFooter from '@/components/nd/AdminFooter'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const [signups, books, tagDescs, languageRows, allPriorityRows] = await Promise.all([
    getAllSignups(),
    fetchBooksForAdmin(),
    db.select().from(tagDescriptions).catch(() => []),
    db.select({ id: users.id, contactEmail: users.contactEmail, languages: users.languages, prioritiesSet: users.prioritiesSet }).from(users).catch(() => []),
    db
      .select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, bookName: booksTable.title, rank: bookPriorities.rank })
      .from(bookPriorities)
      .innerJoin(booksTable, eq(bookPriorities.bookId, booksTable.id))
      .catch(() => []),
  ])

  const userLanguagesMap: Record<string, string[]> = {}
  const prioritiesSetMap: Record<string, boolean> = {}
  for (const row of languageRows) {
    if (row.id) {
      prioritiesSetMap[row.id] = row.prioritiesSet ?? false
    }
    if (row.languages && row.id) {
      try { userLanguagesMap[row.id] = JSON.parse(row.languages) } catch { /* skip */ }
    }
  }

  const bookPrioritiesMap: Record<string, { bookId: string; bookName: string; rank: number }[]> = {}
  for (const row of allPriorityRows) {
    if (!bookPrioritiesMap[row.userId]) bookPrioritiesMap[row.userId] = []
    bookPrioritiesMap[row.userId].push({ bookId: row.bookId, bookName: row.bookName, rank: row.rank })
  }
  for (const pgId of Object.keys(bookPrioritiesMap)) {
    bookPrioritiesMap[pgId].sort((a, b) => a.rank - b.rank)
  }

  // reading_status and is_new are now first-class fields on `books`.
  const statusMap = Object.fromEntries(
    books.filter(b => b.status).map(b => [b.id, b.status as 'reading' | 'read'])
  )
  const newFlagsMap = Object.fromEntries(books.map(b => [b.id, b.isNew]))

  const allTags = Array.from(new Set(books.flatMap(b => b.tags))).sort()
  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBookIds.includes(book.id)),
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
      />
      <AdminFooter
        buildTime={buildTime}
        commitSha={sha ?? null}
        shortSha={shortSha}
        commitMsg={commitMsg}
      />
    </>
  )
}

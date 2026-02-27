import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { db } from '@/lib/db'
import { bookStatuses } from '@/lib/db/schema'
import AdminPanel from '@/components/nd/AdminPanel'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  const [signups, books, statuses] = await Promise.all([
    getAllSignups(),
    fetchBooksWithCovers(),
    db.select().from(bookStatuses).catch(() => []),
  ])

  const statusMap = Object.fromEntries(
    statuses.map(s => [s.bookId, s.status as 'reading' | 'read'])
  )

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBooks.includes(book.name)),
    }))
    .filter(b => b.users.length > 0)

  return (
    <SessionProvider>
      <AdminPanel users={signups} byBook={byBook} statuses={statusMap} />
    </SessionProvider>
  )
}

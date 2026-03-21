import { auth } from '@/lib/auth'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { getAllSignups } from '@/lib/signups'
import { db } from '@/lib/db'
import { bookStatuses, tagDescriptions } from '@/lib/db/schema'
import { SessionProvider } from 'next-auth/react'
import BooksPage from '@/components/nd/BooksPage'
import GoogleOneTap from '@/components/nd/GoogleOneTap'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [session, books, signups, statuses, tagDescs] = await Promise.all([
    auth(),
    fetchBooksWithCovers(),
    getAllSignups().catch(() => []),
    db.select().from(bookStatuses).catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
  ])

  const statusMap = new Map(statuses.map(s => [s.bookId, s.status as 'reading' | 'read']))

  const signupCountByName = new Map<string, number>()
  for (const signup of signups) {
    for (const bookName of signup.selectedBooks) {
      signupCountByName.set(bookName, (signupCountByName.get(bookName) ?? 0) + 1)
    }
  }

  const booksWithStatus = books.map(b => ({
    ...b,
    status: statusMap.get(b.id) ?? null,
    signupCount: signupCountByName.get(b.name) ?? 0,
  }))

  const currentUser = session?.user?.email
    ? signups.find(s => s.email === session.user!.email) ?? null
    : null

  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))

  return (
    <SessionProvider>
      {!session && <GoogleOneTap />}
      <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} />
    </SessionProvider>
  )
}

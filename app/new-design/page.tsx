import { auth } from '@/lib/auth'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { getAllSignups } from '@/lib/signups'
import { SessionProvider } from 'next-auth/react'
import BooksPage from '@/components/nd/BooksPage'

export const dynamic = 'force-dynamic'

export default async function NewDesignHome() {
  const [session, books, signups] = await Promise.all([
    auth(),
    fetchBooksWithCovers(),
    getAllSignups().catch(() => []),
  ])

  const currentUser = session?.user?.email
    ? signups.find(s => s.email === session.user!.email) ?? null
    : null

  return (
    <SessionProvider>
      <BooksPage books={books} currentUser={currentUser} />
    </SessionProvider>
  )
}

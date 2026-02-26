import { auth } from '@/lib/auth'
import { fetchBooks } from '@/lib/sheets'
import { getAllSignups } from '@/lib/signups'
import BooksPage from '@/components/BooksPage'
import { SessionProvider } from 'next-auth/react'

export default async function OldDesignHome() {
  const [session, books, signups] = await Promise.all([
    auth(),
    fetchBooks(),
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

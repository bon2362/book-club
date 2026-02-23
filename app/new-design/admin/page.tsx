import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import AdminPanel from '@/components/nd/AdminPanel'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function NewDesignAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/new-design')

  const [signups, books] = await Promise.all([getAllSignups(), fetchBooksWithCovers()])

  const byBook = books
    .map(book => ({
      book,
      users: signups.filter(s => s.selectedBooks.includes(book.name)),
    }))
    .filter(b => b.users.length > 0)

  return (
    <SessionProvider>
      <AdminPanel users={signups} byBook={byBook} />
    </SessionProvider>
  )
}

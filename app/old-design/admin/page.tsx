import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAllSignups } from '@/lib/signups'
import { fetchBooks } from '@/lib/sheets'
import AdminPanel from '@/components/AdminPanel'
import { SessionProvider } from 'next-auth/react'

export default async function OldDesignAdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/old-design')

  const [signups, books] = await Promise.all([getAllSignups(), fetchBooks()])

  const byBook = books.map(book => ({
    book,
    users: signups.filter(s => s.selectedBooks.includes(book.name)),
  })).filter(b => b.users.length > 0)

  return (
    <SessionProvider>
      <AdminPanel users={signups} byBook={byBook} />
    </SessionProvider>
  )
}

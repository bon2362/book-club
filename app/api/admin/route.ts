import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllSignups } from '@/lib/signups'
import { fetchBooks } from '@/lib/sheets'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [signups, books] = await Promise.all([getAllSignups(), fetchBooks()])

  // Group by book: book name → list of users who selected it
  const byBook: Record<string, typeof signups> = {}
  for (const book of books) {
    const users = signups.filter(s => s.selectedBooks.includes(book.name))
    if (users.length > 0) byBook[book.name] = users
  }

  return NextResponse.json({ users: signups, byBook })
}

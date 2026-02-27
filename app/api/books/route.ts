// app/api/books/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchBooks } from '@/lib/sheets'
import { db } from '@/lib/db'
import { bookStatuses } from '@/lib/db/schema'

export async function GET() {
  try {
    const [books, statuses] = await Promise.all([
      fetchBooks(),
      db.select().from(bookStatuses).catch(() => []),
    ])
    const statusMap = new Map(statuses.map(s => [s.bookId, s.status]))
    const booksWithStatus = books.map(b => ({ ...b, status: statusMap.get(b.id) ?? null }))
    return NextResponse.json({ books: booksWithStatus })
  } catch (e) {
    console.error('Failed to fetch books:', e)
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 })
  }
}

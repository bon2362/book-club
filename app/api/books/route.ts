// app/api/books/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchBooks } from '@/lib/sheets'
import { db } from '@/lib/db'
import { bookStatuses, bookSubmissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const [books, statuses, approvedSubmissions] = await Promise.all([
      fetchBooks(),
      db.select().from(bookStatuses).catch(() => []),
      db.select().from(bookSubmissions).where(eq(bookSubmissions.status, 'approved')).catch(() => []),
    ])
    const statusMap = new Map(statuses.map(s => [s.bookId, s.status]))
    const booksWithStatus = books.map(b => ({ ...b, status: statusMap.get(b.id) ?? null }))
    const submissionBooks = approvedSubmissions.map(s => ({
      id: s.id,
      name: s.title,
      tags: s.topic ? [s.topic] : [],
      author: s.author,
      type: 'Book',
      size: '',
      pages: s.pages != null ? String(s.pages) : '',
      date: s.publishedDate ?? '',
      link: s.textUrl ?? '',
      description: s.description ?? '',
      coverUrl: s.coverUrl ?? null,
      status: null,
    }))
    return NextResponse.json({ books: [...booksWithStatus, ...submissionBooks] })
  } catch (e) {
    console.error('Failed to fetch books:', e)
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 })
  }
}

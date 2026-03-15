import { fetchBooks } from '@/lib/sheets'
import { db } from '@/lib/db'
import { bookSubmissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface BookWithCover {
  id: string
  name: string
  tags: string[]
  author: string
  type: string
  size: string
  pages: string
  date: string
  link: string
  description: string
  coverUrl: string | null
  status?: 'reading' | 'read' | null
  signupCount?: number
}

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const [books, approvedSubmissions] = await Promise.all([
    fetchBooks(forceRefresh),
    db.select().from(bookSubmissions).where(eq(bookSubmissions.status, 'approved')).catch(() => []),
  ])

  const submissionBooks: BookWithCover[] = approvedSubmissions.map(s => ({
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
  }))

  return [...books.map(b => ({ ...b })), ...submissionBooks]
}

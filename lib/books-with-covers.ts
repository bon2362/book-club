import { fetchBooks } from '@/lib/sheets'
import { db } from '@/lib/db'
import { bookSubmissions, bookNewFlags } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const NEW_BOOK_DAYS = 30

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
  whyRead: string | null
  isNew: boolean
  status?: 'reading' | 'read' | null
  signupCount?: number
}

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const [books, approvedSubmissions, newFlags] = await Promise.all([
    fetchBooks(forceRefresh),
    db.select().from(bookSubmissions).where(eq(bookSubmissions.status, 'approved')).catch(() => []),
    db.select().from(bookNewFlags).catch(() => []),
  ])

  const flagMap = new Map(newFlags.map(f => [f.bookId, f.isNew]))
  const cutoff = new Date(Date.now() - NEW_BOOK_DAYS * 24 * 60 * 60 * 1000)

  const submissionBooks: BookWithCover[] = approvedSubmissions.map(s => {
    const explicitFlag = flagMap.get(s.id)
    const isNew = explicitFlag !== undefined ? explicitFlag : s.createdAt > cutoff
    return {
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
      whyRead: s.whyRead ?? null,
      isNew,
    }
  })

  return [
    ...books.map(b => ({ ...b, whyRead: b.whyForClub ?? null, isNew: flagMap.get(b.id) ?? false })),
    ...submissionBooks,
  ]
}

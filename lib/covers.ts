import { db } from '@/lib/db'
import { bookCovers } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'

// Exported for testing
export function getInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export interface CoverEntry {
  coverUrl: string | null
  fetchedAt: Date
}

export async function getCoverData(bookIds: string[]): Promise<Map<string, CoverEntry>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db.select().from(bookCovers).where(inArray(bookCovers.bookId, bookIds))
  return new Map(rows.map(r => [r.bookId, { coverUrl: r.coverUrl, fetchedAt: r.fetchedAt }]))
}

export async function fetchAndCacheCover(
  bookId: string,
  title: string,
  author: string
): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${title} ${author}`)
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY
    const url = apiKey
      ? `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&key=${apiKey}`
      : `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
    const res = await fetch(url)
    let coverUrl: string | null = null

    if (res.ok) {
      const data = await res.json() as {
        items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string } } }>
      }
      const raw = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? null
      if (raw) {
        coverUrl = raw.replace('http://', 'https://').replace('&edge=curl', '')
      }
    }

    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl })
      .onConflictDoUpdate({
        target: bookCovers.bookId,
        set: { coverUrl, fetchedAt: new Date() },
      })

    return coverUrl
  } catch {
    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl: null })
      .onConflictDoNothing()
    return null
  }
}

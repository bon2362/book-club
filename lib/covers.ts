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

export async function getCoverUrls(bookIds: string[]): Promise<Map<string, string | null>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db.select().from(bookCovers).where(inArray(bookCovers.bookId, bookIds))
  return new Map(rows.map(r => [r.bookId, r.coverUrl]))
}

export async function fetchAndCacheCover(
  bookId: string,
  title: string,
  author: string
): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${title} ${author}`)
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
    )
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

// Fire-and-forget: fetch covers for books missing from DB or cached as null
export function triggerMissingCovers(
  books: Array<{ id: string; name: string; author: string }>,
  coverMap: Map<string, string | null>
): void {
  const toFetch = books.filter(b => !coverMap.has(b.id) || coverMap.get(b.id) === null)
  if (toFetch.length === 0) return

  void Promise.allSettled(
    toFetch.map(b => fetchAndCacheCover(b.id, b.name, b.author))
  )
}

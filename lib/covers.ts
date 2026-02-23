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
    const query = new URLSearchParams({ title, author, limit: '1' }).toString()
    const res = await fetch(`https://openlibrary.org/search.json?${query}`)
    let coverUrl: string | null = null

    if (res.ok) {
      const data = await res.json() as { docs?: Array<{ cover_i?: number }> }
      const coverId = data.docs?.[0]?.cover_i
      if (coverId) {
        coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      }
    }

    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl })
      .onConflictDoNothing()

    return coverUrl
  } catch {
    await db
      .insert(bookCovers)
      .values({ bookId, coverUrl: null })
      .onConflictDoNothing()
    return null
  }
}

// Fire-and-forget: trigger cover fetches for books with no DB record
export function triggerMissingCovers(
  books: Array<{ id: string; name: string; author: string }>,
  cachedIds: Set<string>
): void {
  const missing = books.filter(b => !cachedIds.has(b.id))
  if (missing.length === 0) return

  void Promise.allSettled(
    missing.map(b => fetchAndCacheCover(b.id, b.name, b.author))
  )
}

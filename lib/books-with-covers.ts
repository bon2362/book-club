import { fetchBooks } from '@/lib/sheets'
import { getCoverData, fetchAndCacheCover } from '@/lib/covers'

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
  why: string
  description: string
  coverUrl: string | null
}

// Don't retry failed cover fetches within this window
const RETRY_NULL_AFTER_MS = 12 * 60 * 60 * 1000 // 12 hours

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const books = await fetchBooks(forceRefresh)
  const coverData = await getCoverData(books.map(b => b.id))

  // Only fetch covers for books that were never attempted, or whose null result is older than 12h
  const booksNeedingFetch = books.filter(b => {
    const entry = coverData.get(b.id)
    if (!entry) return true                         // never fetched
    if (entry.coverUrl) return false                // already have a cover
    return Date.now() - entry.fetchedAt.getTime() > RETRY_NULL_AFTER_MS
  })

  if (booksNeedingFetch.length > 0) {
    const fetched = await Promise.allSettled(
      booksNeedingFetch.map(b => fetchAndCacheCover(b.id, b.name, b.author))
    )
    booksNeedingFetch.forEach((b, i) => {
      const result = fetched[i]
      if (result?.status === 'fulfilled') {
        coverData.set(b.id, { coverUrl: result.value, fetchedAt: new Date() })
      }
    })
  }

  return books.map(b => ({
    ...b,
    coverUrl: coverData.get(b.id)?.coverUrl ?? null,
  }))
}

import { fetchBooks } from '@/lib/sheets'
import { getCoverUrls, fetchAndCacheCover } from '@/lib/covers'

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

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const books = await fetchBooks(forceRefresh)
  const coverMap = await getCoverUrls(books.map(b => b.id))

  // Fetch covers for books with no DB record or null cached cover — synchronously
  // so the result is available on this page load (not the next one).
  const booksNeedingFetch = books.filter(
    b => !coverMap.has(b.id) || coverMap.get(b.id) === null
  )

  if (booksNeedingFetch.length > 0) {
    const fetched = await Promise.allSettled(
      booksNeedingFetch.map(b => fetchAndCacheCover(b.id, b.name, b.author))
    )
    booksNeedingFetch.forEach((b, i) => {
      const result = fetched[i]
      if (result?.status === 'fulfilled') {
        coverMap.set(b.id, result.value)
      }
    })
  }

  return books.map(b => ({
    ...b,
    coverUrl: coverMap.get(b.id) ?? null,
  }))
}

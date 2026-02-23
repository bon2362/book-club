import { fetchBooks, type Book } from '@/lib/sheets'
import { getCoverUrls, triggerMissingCovers } from '@/lib/covers'

export interface BookWithCover extends Book {
  coverUrl: string | null
}

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const books = await fetchBooks(forceRefresh)
  const coverMap = await getCoverUrls(books.map(b => b.id))

  triggerMissingCovers(books, new Set(coverMap.keys()))

  return books.map(b => ({
    ...b,
    coverUrl: coverMap.has(b.id) ? (coverMap.get(b.id) ?? null) : null,
  }))
}

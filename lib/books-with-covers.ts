import { fetchBooks, type Book } from '@/lib/sheets'
import { getCoverUrls, triggerMissingCovers } from '@/lib/covers'

export interface BookWithCover extends Book {
  coverUrl: string | null
}

export async function fetchBooksWithCovers(forceRefresh = false): Promise<BookWithCover[]> {
  const books = await fetchBooks(forceRefresh)
  const coverMap = await getCoverUrls(books.map(b => b.id))

  triggerMissingCovers(books, coverMap)

  return books.map(b => ({
    ...b,
    coverUrl: coverMap.get(b.id) ?? null,
  }))
}

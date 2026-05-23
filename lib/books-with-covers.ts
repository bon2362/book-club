// Catalog source switched from Google Sheets to the books table.
// Kept as a re-export shim so existing imports continue to resolve.
export { fetchBooksWithCovers, fetchBooksForAdmin, fetchBookById } from '@/lib/books'
export type { BookWithCover } from '@/lib/books'

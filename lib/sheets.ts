import { google } from 'googleapis'
import { unstable_cache } from 'next/cache'

export const SHEETS_CACHE_TAG = 'sheets-books'

export interface Book {
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
  whyForClub: string | null
}

// Column indexes (0-based):
// Name, Theme(Tags), Writer(Author), Type, Size, Pages, Date, Link, Status, Description, WhyForClub, Cover
const COL = {
  NAME: 0, TAGS: 1, AUTHOR: 2, TYPE: 3,
  SIZE: 4, PAGES: 5, DATE: 6, LINK: 7, DESC: 10, WHY_FOR_CLUB: 11, COVER: 12
}

export function parseBookRow(row: string[], rowIndex: number): Book | null {
  const name = row[COL.NAME]?.trim()
  if (!name || name === 'Name') return null

  return {
    id: String(rowIndex + 2), // 1-based row number (skip header)
    name,
    tags: (row[COL.TAGS] ?? '').split(',').map(t => t.trim()).filter(Boolean),
    author: row[COL.AUTHOR] ?? '',
    type: row[COL.TYPE] ?? '',
    size: row[COL.SIZE] ?? '',
    pages: row[COL.PAGES] ?? '',
    date: row[COL.DATE] ?? '',
    link: row[COL.LINK] ?? '',
    description: row[COL.DESC] ?? '',
    coverUrl: row[COL.COVER]?.trim() || null,
    whyForClub: row[COL.WHY_FOR_CLUB]?.trim() || null,
  }
}

export function filterBooks(books: Book[]): Book[] {
  return books.filter(b => b.type === 'Book' || b.type === 'Article')
}

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const credentials = JSON.parse(key)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

const TEST_BOOKS: Book[] = [
  {
    id: '2',
    name: 'Тестовая книга',
    tags: ['тест'],
    author: 'Автор Тестов',
    type: 'Book',
    size: 'Средняя',
    pages: '300',
    date: '2024',
    link: '',
    description: 'Описание тестовой книги для E2E тестов. Эта книга содержит достаточно длинное описание, чтобы проверить функцию разворачивания текста в карточке книги на главной странице.',
    coverUrl: null,
    whyForClub: null,
  },
]

async function fetchBooksFromSheets(): Promise<Book[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!.trim(),
    range: 'to read!A:M',
  })

  const rows = (response.data.values ?? []).slice(1) // skip header
  return filterBooks(rows.map((row, i) => parseBookRow(row, i)).filter(Boolean) as Book[])
}

const fetchBooksWithCache = unstable_cache(
  fetchBooksFromSheets,
  ['sheets-books'],
  { tags: [SHEETS_CACHE_TAG], revalidate: 600 },
)

export async function fetchBooks(forceRefresh = false): Promise<Book[]> {
  if (process.env.NEXTAUTH_TEST_MODE === 'true') return TEST_BOOKS
  if (forceRefresh) return fetchBooksFromSheets()
  return fetchBooksWithCache()
}

// Kept for backward compatibility — invalidation now happens via revalidateTag(SHEETS_CACHE_TAG)
export function invalidateCache() {}

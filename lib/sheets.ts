import { google } from 'googleapis'

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
}

// Column indexes (0-based):
// Name, Theme(Tags), Writer(Author), Type, Size, Pages, Date, Link, Status, Why, Description, Cover
const COL = {
  NAME: 0, TAGS: 1, AUTHOR: 2, TYPE: 3,
  SIZE: 4, PAGES: 5, DATE: 6, LINK: 7, DESC: 10, COVER: 11
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
  }
}

export function filterBooks(books: Book[]): Book[] {
  return books.filter(b => b.type === 'Book' || b.type === 'Article')
}

// In-memory cache
let cache: { books: Book[]; timestamp: number } | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const credentials = JSON.parse(key)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export async function fetchBooks(forceRefresh = false): Promise<Book[]> {
  if (!forceRefresh && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.books
  }

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!.trim(),
    range: 'to read!A:M',
  })

  const rows = (response.data.values ?? []).slice(1) // skip header
  const books = filterBooks(rows.map((row, i) => parseBookRow(row, i)).filter(Boolean) as Book[])

  cache = { books, timestamp: Date.now() }
  return books
}

export function invalidateCache() {
  cache = null
}

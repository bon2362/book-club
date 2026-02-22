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
  why: string
  description: string
}

// Column indexes (0-based):
// Col 2 is empty, Col 10 is Status (filtered upstream, not stored in Book)
// rowNum, Name, empty, tags, Writer, Type, Size, Pages, Date, Link, Status, Why, Description
const COL = {
  ID: 0, NAME: 1, TAGS: 3, AUTHOR: 4, TYPE: 5,
  SIZE: 6, PAGES: 7, DATE: 8, LINK: 9, WHY: 11, DESC: 12
}

export function parseBookRow(row: string[]): Book | null {
  const name = row[COL.NAME]?.trim()
  if (!name || name === 'Name') return null

  return {
    id: row[COL.ID] ?? '',
    name,
    tags: (row[COL.TAGS] ?? '').split(',').map(t => t.trim()).filter(Boolean),
    author: row[COL.AUTHOR] ?? '',
    type: row[COL.TYPE] ?? '',
    size: row[COL.SIZE] ?? '',
    pages: row[COL.PAGES] ?? '',
    date: row[COL.DATE] ?? '',
    link: row[COL.LINK] ?? '',
    why: row[COL.WHY] ?? '',
    description: row[COL.DESC] ?? '',
  }
}

export function filterBooks(books: Book[]): Book[] {
  return books.filter(b => b.type === 'Book')
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
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: 'to read!A:M',
  })

  const rows = (response.data.values ?? []).slice(1) // skip header
  const books = filterBooks(rows.map(parseBookRow).filter(Boolean) as Book[])

  cache = { books, timestamp: Date.now() }
  return books
}

export function invalidateCache() {
  cache = null
}

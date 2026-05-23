export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchBooksWithCovers } from '@/lib/books'

export async function GET() {
  try {
    const books = await fetchBooksWithCovers()
    // The legacy public response shape was { books: BookWithCover[] }.
    return NextResponse.json({ books })
  } catch (e) {
    console.error('Failed to fetch books:', e)
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 })
  }
}

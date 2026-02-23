// app/api/books/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchBooks } from '@/lib/sheets'

export async function GET() {
  try {
    const books = await fetchBooks()
    return NextResponse.json({ books })
  } catch (e) {
    console.error('Failed to fetch books:', e)
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 })
  }
}

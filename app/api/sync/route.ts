import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { invalidateCache, fetchBooks, SHEETS_CACHE_TAG } from '@/lib/sheets'

export async function POST() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  invalidateCache()
  revalidateTag(SHEETS_CACHE_TAG)
  const books = await fetchBooks(true)
  revalidatePath('/')
  revalidatePath('/api/books')
  return NextResponse.json({ ok: true, count: books.length })
}

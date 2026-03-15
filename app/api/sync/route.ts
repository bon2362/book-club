import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { invalidateCache, fetchBooks } from '@/lib/sheets'

export async function POST() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  invalidateCache()
  const books = await fetchBooks(true)
  revalidatePath('/')
  return NextResponse.json({ ok: true, count: books.length })
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchTimelineSummaries } from '@/lib/timeline/queries'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Админу нужны и черновики — публичный список их скрывает.
  const data = await fetchTimelineSummaries({ includeUnpublished: true })
  return NextResponse.json({ success: true, data })
}

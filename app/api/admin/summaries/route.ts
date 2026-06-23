export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listAdminSummaries } from '@/lib/book-summaries'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const summaries = await listAdminSummaries()
  return NextResponse.json({ summaries })
}

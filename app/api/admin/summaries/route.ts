export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listAdminSummaries, listAdminSummaryRevisions } from '@/lib/book-summaries'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [summaries, revisions] = await Promise.all([
    listAdminSummaries(),
    listAdminSummaryRevisions(),
  ])
  return NextResponse.json({
    summaries: [
      ...summaries.map(summary => ({
        ...summary,
        kind: 'summary' as const,
        summaryId: summary.id,
      })),
      ...revisions.map(revision => ({
        ...revision,
        kind: 'revision' as const,
      })),
    ],
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SummaryValidationError, adminPublishSummary } from '@/lib/book-summaries'

function actorLabel(user: { name?: string | null; contactEmail?: string | null } | undefined): string | null {
  return user?.name ?? user?.contactEmail ?? null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const summary = await adminPublishSummary({
      id: params.id,
      adminUserId: session.user.id,
      actorLabel: actorLabel(session.user),
    })
    return NextResponse.json({ summary })
  } catch (error) {
    if (error instanceof SummaryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

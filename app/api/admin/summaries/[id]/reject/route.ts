export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SummaryValidationError, adminRejectSummary } from '@/lib/book-summaries'

function actorLabel(user: { name?: string | null; contactEmail?: string | null } | undefined): string | null {
  return user?.name ?? user?.contactEmail ?? null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  try {
    const summary = await adminRejectSummary({
      id: params.id,
      adminUserId: session.user.id,
      actorLabel: actorLabel(session.user),
      rejectionReason: String(body.rejectionReason ?? ''),
    })
    return NextResponse.json({ summary })
  } catch (error) {
    if (error instanceof SummaryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

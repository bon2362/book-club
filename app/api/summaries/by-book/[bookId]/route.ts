export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SummaryValidationError, getAuthorSummaryForBook, openOrCreateSummaryDraft } from '@/lib/book-summaries'

function actorLabel(user: { name?: string | null; contactEmail?: string | null } | undefined): string | null {
  return user?.name ?? user?.contactEmail ?? null
}

function validationResponse(error: unknown) {
  if (error instanceof SummaryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  throw error
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { bookId: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await getAuthorSummaryForBook(params.bookId, session.user.id)
  return NextResponse.json({ summary })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { bookId: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await openOrCreateSummaryDraft({
      bookId: params.bookId,
      userId: session.user.id,
      actorLabel: actorLabel(session.user),
      defaultDisplayName: actorLabel(session.user),
    })
    return NextResponse.json({ summary })
  } catch (error) {
    return validationResponse(error)
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SummaryValidationError, saveAuthorSummary } from '@/lib/book-summaries'

function actorLabel(user: { name?: string | null; contactEmail?: string | null } | undefined): string | null {
  return user?.name ?? user?.contactEmail ?? null
}

function validationResponse(error: unknown) {
  if (error instanceof SummaryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  throw error
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await saveAuthorSummary({
      id: params.id,
      userId: session.user.id,
      actorLabel: actorLabel(session.user),
      patch: await req.json(),
    })
    return NextResponse.json({ summary })
  } catch (error) {
    return validationResponse(error)
  }
}
